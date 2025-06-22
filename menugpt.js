javascript: (() => {
  const HCK_ID = "hck-prova-paulista-v3-multi"
  if (document.getElementById(HCK_ID)) {
    console.warn("HCK: Já em execução.")
    return
  }

  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (isMobile()) {
    alert("HCK - PROVA PAULISTA V3 MULTI-API\n\nEste script não tem suporte para dispositivos móveis.")
    return
  }

  const SCRIPT_VERSION = "13.0.0-multi-api"
  const CONFIG = {
    API_ENDPOINT: "https://v0-openrouter-ai-endpoint.vercel.app/",
    MODELS: [
      { id: "gpt-4o-mini", name: "GPT-4O Mini (Rápido)" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 (Geral)" },
      { id: "deepseek-chat", name: "DeepSeek V3 (Eficiente)" },
      { id: "gpt-4o", name: "GPT-4O (Avançado)" },
    ],
    API_PROVIDERS: [
      { id: "aiml", name: "AI/ML API", icon: "🤖", color: "#8B5CF6", needsKey: true },
      { id: "openrouter", name: "OpenRouter", icon: "🔄", color: "#10B981", needsKey: false },
      { id: "together", name: "Together AI", icon: "🔗", color: "#F59E0B", needsKey: false },
    ],
    API_TIMEOUT: 30000,
    NOTIFICATION_TIMEOUT: 4000,
  }
  const STATE = {
    lastAnswer: null,
    isRunning: false,
    currentModelIndex: 0,
    currentProviderIndex: 0,
    userApiKey: localStorage.getItem("hck-user-api-key") || "",
    ui: {},
    activeNotifications: {},
  }

  const log = (level, ...args) => (console[level.toLowerCase()] || console.log)(`[HCK]`, ...args)
  const withTimeout = (promise, ms) =>
    Promise.race([promise, new Promise((_, rj) => setTimeout(() => rj(new Error(`Timeout ${ms}ms`)), ms))])
  const sanitize = (text) =>
    typeof text === "string"
      ? text
          .replace(/\n\s*\n/g, "\n")
          .replace(/ {2,}/g, " ")
          .trim()
      : ""

  function getContent(node) {
    if (
      !node ||
      (node.nodeType === Node.ELEMENT_NODE &&
        ((node.offsetParent === null && node.style.display !== "flex") || node.style.display === "none"))
    )
      return ""
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue
    const tagName = node.tagName?.toUpperCase()
    if (tagName === "IMG") {
      try {
        const url = new URL(node.src || node.dataset.src, window.location.href).toString()
        if (
          !/(_logo|\.svg|icon|button|banner|avatar|profile|thumb|sprite|captcha|loading|spinner|placeholder|background|pattern|texture|favicon|asset|static|decorator|spacer|dummy|transparent|1x1|blank\.gif|clear\.gif|ad\.|advert|tracking|pixel|beacon)/i.test(
            url,
          )
        )
          return ` [IMAGEM]: ${url} `
      } catch (e) {}
      return ""
    }
    if (node.matches && node.matches("mjx-container, .MathJax, .katex, math")) {
      const latex =
        node.getAttribute("aria-label") ||
        node.dataset.latex ||
        node.querySelector('annotation[encoding*="tex"]')?.textContent
      if (latex?.trim()) return ` $${latex.trim()}$ `
    }
    let inner = ""
    if (node.hasChildNodes()) {
      for (const child of node.childNodes) {
        inner += getContent(child)
      }
    }
    if (["P", "DIV", "H1", "H2", "H3", "LI", "BLOCKQUOTE", "BR", "TR"].includes(tagName)) return inner + "\n"
    return inner
  }

  function extractQuestion() {
    let card = null
    const selectors =
      'div.MuiPaper-root, article[class*="question"], section[class*="assessment"], div[class*="questao"]'
    for (const c of document.querySelectorAll(selectors)) {
      if (c.closest("#" + HCK_ID)) continue
      if (c.querySelector('div[role="radiogroup"], ul[class*="option"], ol[class*="choice"]')) {
        card = c
        break
      }
    }
    if (!card) card = document.body

    let statement = ""
    const statementEl = card.querySelector('.ql-editor, div[class*="enunciado"], .question-statement, .texto-base')
    if (statementEl && !statementEl.closest('div[role="radiogroup"]')) {
      statement = getContent(statementEl)
    } else {
      for (const child of card.childNodes) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child.matches('div[role="radiogroup"], ul[class*="option"], ol[class*="choice"]') ||
            child.querySelector('div[role="radiogroup"]'))
        )
          break
        statement += getContent(child)
      }
    }
    statement = sanitize(statement)

    const alternatives = []
    const radioGroup = card.querySelector('div[role="radiogroup"], ul[class*="option"], ol[class*="choice"]')
    if (radioGroup) {
      const items = Array.from(radioGroup.children).filter((el) => el.matches("div, label, li"))
      items.forEach((item) => {
        if (alternatives.length >= 5) return
        const letter = String.fromCharCode(65 + alternatives.length)
        const content = sanitize(getContent(item))
          .replace(/^[A-Ea-e][).]\s*/, "")
          .trim()
        if (content) alternatives.push(`${letter}) ${content}`)
      })
    }

    if (statement.length < 5 && alternatives.every((a) => a.length < 10))
      return "Falha na extração: conteúdo insuficiente."
    return `--- Enunciado ---\n${statement || "(Vazio)"}\n\n--- Alternativas ---\n${alternatives.join("\n") || "(Nenhuma)"}`.replace(
      /\n{3,}/g,
      "\n\n",
    )
  }

  async function queryApi(text, modelId) {
    const currentProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]
    const payload = {
      messages: [{ role: "user", content: text }],
      modelId: modelId,
      apiProvider: currentProvider.id,
      userApiKey: STATE.userApiKey || undefined,
    }

    const res = await fetch(CONFIG.API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || `Erro HTTP ${res.status}`)
    if (data.response) return data
    throw new Error("API retornou resposta inválida.")
  }

  const formatResponse = (ans) =>
    typeof ans === "string"
      ? (ans.trim().match(/\b([A-E])\b/i)?.[1] || ans.trim().match(/^[A-E]$/i)?.[0])?.toUpperCase()
      : null
  const PULSE_CLASS = "hck-pulse-visual"

  function applyPulse(letter) {
    document.querySelectorAll("." + PULSE_CLASS).forEach((e) => e.classList.remove(PULSE_CLASS))
    if (!letter) return
    const index = letter.charCodeAt(0) - 65
    const alts = document.querySelectorAll(
      'div[role="radiogroup"] > label, div[role="radiogroup"] > div, ul[class*="option"] > li, ol[class*="choice"] > li',
    )
    if (alts[index])
      (alts[index].querySelector(".MuiRadio-root, input[type=radio]") || alts[index]).classList.add(PULSE_CLASS)
  }

  function cycleModel() {
    if (STATE.isRunning) return
    STATE.currentModelIndex = (STATE.currentModelIndex + 1) % CONFIG.MODELS.length
    const newModel = CONFIG.MODELS[STATE.currentModelIndex]
    STATE.ui.updateModelDisplay(newModel.name)
    STATE.ui.notify({ id: "model_change", text: "Modelo Alterado", detail: newModel.name, type: "info" })
  }

  function cycleProvider() {
    if (STATE.isRunning) return
    STATE.currentProviderIndex = (STATE.currentProviderIndex + 1) % CONFIG.API_PROVIDERS.length
    const newProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]
    STATE.ui.updateProviderDisplay(newProvider.name)
    STATE.ui.updateApiKeyStatus()
    STATE.ui.notify({
      id: "provider_change",
      text: "API Alterada",
      detail: `${newProvider.icon} ${newProvider.name}`,
      type: "info",
    })
  }

  function showApiKeyDialog() {
    const currentProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]

    const dialog = document.createElement("div")
    dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 2147483648;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'JetBrains Mono', monospace;
        `

    dialog.innerHTML = `
            <div style="
                background: rgba(16, 16, 24, 0.95);
                border: 1px solid #333344;
                border-radius: 12px;
                padding: 24px;
                width: 400px;
                max-width: 90vw;
                color: #E2E2FF;
            ">
                <h3 style="margin: 0 0 16px 0; color: #C77DFF;">🔑 Configurar API Key</h3>
                <div style="margin-bottom: 16px; padding: 12px; background: rgba(199, 125, 255, 0.1); border-radius: 8px; border: 1px solid rgba(199, 125, 255, 0.3);">
                    <div style="font-weight: 500; margin-bottom: 4px;">API Atual: ${currentProvider.icon} ${currentProvider.name}</div>
                    <div style="font-size: 12px; color: #8890B3;">
                        ${currentProvider.needsKey ? "⚠️ Requer chave API para melhor funcionamento" : "✅ Funciona sem chave API"}
                    </div>
                </div>
                <p style="margin: 0 0 16px 0; font-size: 14px; color: #8890B3;">
                    ${currentProvider.needsKey ? "Configure sua chave para usar esta API:" : "Chave opcional para esta API:"}
                </p>
                <input 
                    type="text" 
                    id="api-key-input" 
                    placeholder="Cole sua chave API aqui..."
                    value="${STATE.userApiKey}"
                    style="
                        width: 100%;
                        padding: 12px;
                        background: rgba(30, 30, 40, 0.8);
                        border: 1px solid #333344;
                        border-radius: 6px;
                        color: #E2E2FF;
                        font-family: monospace;
                        font-size: 12px;
                        margin-bottom: 16px;
                        box-sizing: border-box;
                    "
                />
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="cancel-btn" style="
                        padding: 8px 16px;
                        background: rgba(136, 144, 179, 0.2);
                        border: none;
                        border-radius: 6px;
                        color: #E2E2FF;
                        cursor: pointer;
                        font-size: 14px;
                    ">Cancelar</button>
                    <button id="save-btn" style="
                        padding: 8px 16px;
                        background: #C77DFF;
                        border: none;
                        border-radius: 6px;
                        color: white;
                        cursor: pointer;
                        font-size: 14px;
                    ">Salvar</button>
                </div>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333344;">
                    <div style="font-size: 12px; color: #8890B3; margin-bottom: 8px;">💡 Onde obter chaves gratuitas:</div>
                    <div style="font-size: 11px; color: #8890B3; line-height: 1.4;">
                        • <strong>AI/ML API:</strong> aimlapi.com<br>
                        • <strong>OpenRouter:</strong> openrouter.ai<br>
                        • <strong>Together AI:</strong> together.ai
                    </div>
                </div>
            </div>
        `

    document.body.appendChild(dialog)

    const input = document.getElementById("api-key-input")
    const saveBtn = document.getElementById("save-btn")
    const cancelBtn = document.getElementById("cancel-btn")

    const close = () => dialog.remove()

    saveBtn.onclick = () => {
      const key = input.value.trim()
      STATE.userApiKey = key
      if (key) {
        localStorage.setItem("hck-user-api-key", key)
      } else {
        localStorage.removeItem("hck-user-api-key")
      }
      STATE.ui.updateApiKeyStatus()
      close()
    }

    cancelBtn.onclick = close
    dialog.onclick = (e) => e.target === dialog && close()

    input.focus()
  }

  async function run() {
    if (STATE.isRunning) return
    STATE.isRunning = true
    STATE.lastAnswer = null
    applyPulse(null)

    const currentModel = CONFIG.MODELS[STATE.currentModelIndex]
    const currentProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]

    STATE.ui.notify({
      id: "processing_status",
      text: "Processando...",
      detail: `${currentProvider.icon} ${currentProvider.name} • ${currentModel.name}`,
      type: "processing",
    })

    try {
      const question = extractQuestion()
      if (question.startsWith("Falha")) throw new Error(question)

      const result = await withTimeout(queryApi(question, currentModel.id), CONFIG.API_TIMEOUT)
      const answer = formatResponse(result.response)
      const icon = result.source === "database_cache" ? "💾" : currentProvider.icon
      const modelName = result.model
        ? result.model
            .split("/")
            .pop()
            .replace(/-latest$/, "")
        : "IA"
      const detail = `${result.apiUsed || currentProvider.name} • ${modelName}`

      if (answer) {
        STATE.lastAnswer = answer
        STATE.ui.notify({
          id: "processing_status",
          text: `${icon} Resposta: ${answer}`,
          detail: detail,
          type: "success",
        })
      } else {
        throw new Error("Formato de resposta inválido.")
      }
    } catch (error) {
      log("ERROR", "Falha no ciclo:", error)
      STATE.ui.notify({
        id: "processing_status",
        text: "Ocorreu um Erro",
        detail: error.message.substring(0, 40),
        type: "error",
      })
    } finally {
      STATE.isRunning = false
    }
  }

  function showAnswer() {
    if (STATE.isRunning) return
    if (STATE.lastAnswer) {
      applyPulse(STATE.lastAnswer)
      STATE.ui.notify({
        id: "marking_status",
        text: `Mostrando Resposta: ${STATE.lastAnswer}`,
        type: "marking",
      })
      STATE.lastAnswer = null
    } else {
      STATE.ui.notify({
        id: "marking_status",
        text: "Nenhuma resposta para mostrar",
        detail: "Use [2] para executar.",
        type: "warn",
      })
    }
  }

  function kill() {
    document.removeEventListener("keydown", handleKeys, true)
    document.getElementById(HCK_ID)?.remove()
  }

  function handleKeys(e) {
    if (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.repeat) return
    const actions = {
      1: STATE.ui.toggleMenu,
      2: run,
      3: showAnswer,
      4: cycleModel,
      5: cycleProvider,
      6: showApiKeyDialog,
      7: kill,
    }
    actions[e.key]?.(e.preventDefault())
    if (e.key === "Escape") STATE.ui.toggleMenu(false)
  }

  function setupUI() {
    const C = {
      font: "'JetBrains Mono', monospace",
      bg: "rgba(16, 16, 24, 0.9)",
      text: "#E2E2FF",
      text2: "#8890B3",
      grad: "linear-gradient(90deg, #C77DFF, #00D0FF)",
      pulse: "#F50057",
      border: "#333344",
      shadow: "0 8px 30px rgba(0,0,0,0.5)",
    }

    const style = document.createElement("style")
    style.textContent = `
            @keyframes hck-pulse-anim{to{box-shadow:0 0 0 12px transparent;}} 
            .${PULSE_CLASS}{border-radius:50%; animation: hck-pulse-anim 1.2s infinite; box-shadow: 0 0 0 0 ${C.pulse};} 
            @keyframes hck-fade-in{from{opacity:0;transform:scale(0.95) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}} 
            @keyframes hck-progress-bar{from{width:100%;}to{width:0%;}}
        `
    document.head.appendChild(style)

    const container = document.createElement("div")
    container.id = HCK_ID
    container.style.cssText = `position:fixed; bottom:20px; right:20px; z-index:2147483647; font-family:${C.font}; animation:hck-fade-in .4s ease-out;`

    const menu = document.createElement("div")
    menu.style.cssText = `width:300px; background:${C.bg}; backdrop-filter:blur(10px); color:${C.text}; padding:12px; border-radius:10px; border:1px solid ${C.border}; box-shadow:${C.shadow}; display:none; flex-direction:column; gap:8px; transition: all .3s ease-out; position:absolute; bottom:calc(100% + 10px); right:0; opacity:0; transform-origin: bottom right;`

    const titleBar = document.createElement("div")
    titleBar.innerHTML = `<div style="font-weight:600; font-size:14px; background:${C.grad}; -webkit-background-clip:text; -webkit-text-fill-color:transparent;">HCK - PROVA PAULISTA V3</div><div style="font-size:9px; color:${C.text2}; align-self:flex-end;">v${SCRIPT_VERSION}</div>`
    titleBar.style.cssText = `display:flex; justify-content:space-between; align-items:center;`

    const providerDisplay = document.createElement("div")
    providerDisplay.style.cssText = `font-size:11px; color:${C.text2}; text-align:center; background:rgba(0,0,0,0.2); padding: 6px; border-radius: 6px; border: 1px solid ${C.border}; margin-top: 8px; cursor: pointer;`
    providerDisplay.onclick = cycleProvider

    const modelDisplay = document.createElement("div")
    modelDisplay.style.cssText = `font-size:11px; color:${C.text2}; text-align:center; background:rgba(0,0,0,0.2); padding: 6px; border-radius: 6px; border: 1px solid ${C.border}; margin-top: 4px; cursor: pointer;`
    modelDisplay.onclick = cycleModel

    const apiKeyStatus = document.createElement("div")
    apiKeyStatus.style.cssText = `font-size:10px; color:${C.text2}; text-align:center; padding: 4px; border-radius: 4px; margin-top: 4px; cursor: pointer;`
    apiKeyStatus.onclick = showApiKeyDialog

    const shortcuts = document.createElement("div")
    shortcuts.innerHTML = `<div style="display:grid; grid-template-columns:auto 1fr; gap:4px 10px; font-size:10px; color:${C.text2}; margin-top:8px; padding-top:8px; border-top: 1px solid ${C.border};"><b style="color:${C.text};">[1]</b>Menu <b style="color:${C.text};">[2]</b>Executar <b style="color:${C.text};">[3]</b>Marcar <b style="color:${C.text};">[4]</b>Modelo <b style="color:${C.text};">[5]</b>API <b style="color:${C.text};">[6]</b>Chave <b style="color:${C.text};">[7]</b>Sair</div>`

    const credits = document.createElement("div")
    credits.innerHTML = `by <b style="background:${C.grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Hackermoon1</b> & <b style="background:${C.grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Dontbrazz</b>`
    credits.style.cssText = `font-size:10px; color:${C.text2}; opacity:0.7; text-align:center; padding-top:8px; margin-top:5px; border-top: 1px solid ${C.border};`

    menu.append(titleBar, providerDisplay, modelDisplay, apiKeyStatus, shortcuts, credits)

    const toggleBtn = document.createElement("button")
    toggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
    toggleBtn.style.cssText = `background:${C.bg}; color:${C.text2}; width:44px; height:44px; border:1px solid ${C.border}; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); transition: all .3s ease; opacity: 0.8;`
    toggleBtn.onmouseover = () => {
      toggleBtn.style.opacity = "1"
      toggleBtn.style.transform = "scale(1.1)"
    }
    toggleBtn.onmouseout = () => {
      toggleBtn.style.opacity = "0.8"
      toggleBtn.style.transform = "scale(1)"
    }

    container.append(menu, toggleBtn)
    document.body.appendChild(container)

    const notificationContainer = document.createElement("div")
    notificationContainer.style.cssText = `position:fixed; top:20px; right:20px; z-index:2147483647; display:flex; flex-direction:column; align-items:flex-end; gap:10px;`
    document.body.appendChild(notificationContainer)

    const updateProviderDisplay = (providerName) => {
      const currentProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]
      providerDisplay.innerHTML = `API: <strong style="color:${C.text};">${currentProvider.icon} ${providerName}</strong>`
      providerDisplay.style.borderColor = currentProvider.color + "50"
      providerDisplay.style.background = currentProvider.color + "15"
    }

    const updateModelDisplay = (modelName) => {
      modelDisplay.innerHTML = `Modelo: <strong style="color:${C.text};">${modelName}</strong>`
    }

    const updateApiKeyStatus = () => {
      const currentProvider = CONFIG.API_PROVIDERS[STATE.currentProviderIndex]
      const hasKey = !!STATE.userApiKey

      if (currentProvider.needsKey) {
        if (hasKey) {
          apiKeyStatus.innerHTML = `🔑 <strong style="color:#10B981;">Chave Configurada</strong>`
          apiKeyStatus.style.background = "rgba(16, 185, 129, 0.15)"
          apiKeyStatus.style.borderColor = "rgba(16, 185, 129, 0.3)"
        } else {
          apiKeyStatus.innerHTML = `🔑 <strong style="color:#F59E0B;">Chave Necessária</strong>`
          apiKeyStatus.style.background = "rgba(245, 158, 11, 0.15)"
          apiKeyStatus.style.borderColor = "rgba(245, 158, 11, 0.3)"
        }
      } else {
        apiKeyStatus.innerHTML = `🔑 <strong style="color:${C.text2};">Chave Opcional</strong>`
        apiKeyStatus.style.background = "rgba(136, 144, 179, 0.1)"
        apiKeyStatus.style.borderColor = "rgba(136, 144, 179, 0.2)"
      }
      apiKeyStatus.style.border = "1px solid"
    }

    const toggleMenu = (force) => {
      const shouldShow = force !== undefined ? force : menu.style.display === "none"
      if (shouldShow) {
        menu.style.display = "flex"
        setTimeout(() => {
          menu.style.opacity = "1"
          menu.style.transform = "scale(1) translateY(0)"
        }, 10)
      } else {
        menu.style.opacity = "0"
        menu.style.transform = "scale(0.95) translateY(10px)"
        setTimeout(() => {
          menu.style.display = "none"
        }, 300)
      }
    }
    toggleBtn.onclick = () => toggleMenu()

    const notify = (p) => {
      const { id, text, detail, type, duration } = {
        id: `notif_${Date.now()}`,
        text: "Info",
        detail: "",
        type: "info",
        ...p,
      }
      if (STATE.activeNotifications[id]) STATE.activeNotifications[id]()

      const color = {
        info: "#00D0FF",
        success: "#A070FF",
        error: "#F50057",
        warn: "#FFDB41",
        processing: "#FFDB41",
        marking: C.pulse,
      }[type]
      const n = document.createElement("div")
      n.style.cssText = `width:300px; background:rgba(22, 22, 30, 0.9); backdrop-filter:blur(10px); color:${C.text}; padding:12px 16px; border-radius:10px; box-shadow:${C.shadow}; display:flex; flex-direction:column; gap:4px; opacity:0; transform:translateX(20px); transition:all .4s cubic-bezier(0.2, 1, 0.4, 1); border-left:4px solid ${color}; cursor:pointer; font-size:14px; overflow:hidden;`
      n.innerHTML = `<strong style="color:${color};">${text}</strong>${detail ? `<span style="font-size:0.9em;color:${C.text2};display:block;">${detail}</span>` : ""}<div class="hck-progress-bar" style="position:absolute; bottom:0; left:0; height:2px; background:${color}; opacity:0.6;"></div>`

      const hide = () => {
        n.style.opacity = "0"
        n.style.transform = "translateX(20px)"
        setTimeout(() => n.remove(), 400)
        delete STATE.activeNotifications[id]
      }

      n.onclick = hide
      notificationContainer.appendChild(n)
      setTimeout(() => {
        n.style.opacity = "1"
        n.style.transform = "translateX(0)"
      }, 10)

      const timeoutDuration =
        duration || (type === "processing" ? CONFIG.API_TIMEOUT + 1000 : CONFIG.NOTIFICATION_TIMEOUT)
      const timeoutId = setTimeout(hide, timeoutDuration)

      STATE.activeNotifications[id] = () => {
        clearTimeout(timeoutId)
        hide()
      }

      if (type !== "processing") {
        n.querySelector(".hck-progress-bar").style.animation = `hck-progress-bar ${timeoutDuration}ms linear forwards`
      }
    }

    return { notify, updateModelDisplay, updateProviderDisplay, updateApiKeyStatus, toggleMenu }
  }

  try {
    STATE.ui = setupUI()
    document.addEventListener("keydown", handleKeys, true)
    log("INFO", `----- HCK - PROVA PAULISTA V3 MULTI-API (v${SCRIPT_VERSION}) Activated -----`)

    // Initialize displays
    STATE.ui.updateProviderDisplay(CONFIG.API_PROVIDERS[STATE.currentProviderIndex].name)
    STATE.ui.updateModelDisplay(CONFIG.MODELS[STATE.currentModelIndex].name)
    STATE.ui.updateApiKeyStatus()

    STATE.ui.notify({
      text: "HCK V3 Multi-API Ativado",
      detail: "Pressione [1] para ver o menu • [5] para alternar API",
      type: "success",
    })
  } catch (e) {
    console.error("HCK Init Fail:", e)
  }
})()
