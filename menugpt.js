javascript: (() => {
  const HCK_ID = "hck-prova-paulista-v2"
  if (document.getElementById(HCK_ID)) {
    console.warn("HCK: Já em execução.")
    return
  }

  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (isMobile()) {
    alert("HCK - PROVA PAULISTA V2\n\nEste script não tem suporte para dispositivos móveis.")
    return
  }

  const SCRIPT_VERSION = "13.0.0-reasoning"
  const CONFIG = {
    API_ENDPOINT: "https://v0-openrouter-ai-endpoint.vercel.app/api/chat-selector",
    CACHE_ENDPOINT: "https://v0-openrouter-ai-endpoint.vercel.app/api/cache",
    MODELS: [
      { id: "gpt-4o", name: "GPT-4O (Inteligente)" },
      { id: "claude-3.5-sonnet", name: "Claude 3.5 (Analítico)" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 (Visão)" },
      { id: "gpt-4o-mini", name: "GPT-4O Mini (Rápido)" },
    ],
    API_TIMEOUT: 45000,
    NOTIFICATION_TIMEOUT: 6000,
  }
  const STATE = {
    lastAnswer: null,
    lastReasoning: null,
    isRunning: false,
    currentModelIndex: 0,
    ui: {},
    activeNotifications: {},
    imageCount: 0,
    lastQuestion: null,
    lastResponse: null,
    lastCacheId: null,
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

  // Função para extrair resposta do raciocínio da IA
  const extractAnswerFromReasoning = (reasoning) => {
    if (typeof reasoning !== "string") {
      log("ERROR", "❌ RACIOCÍNIO NÃO É STRING:", typeof reasoning, reasoning)
      return { answer: null, reasoning: null }
    }

    log("INFO", "🧠 ANALISANDO RACIOCÍNIO DA IA:")
    log("INFO", "📝 Raciocínio completo:", reasoning)

    // Salvar o raciocínio completo
    STATE.lastReasoning = reasoning

    // Estratégias para extrair a resposta final
    const strategies = [
      {
        name: "Resposta: X (formato padrão)",
        regex: /Resposta:\s*([A-E])/i,
        priority: 1,
      },
      {
        name: "Alternativa correta é X",
        regex: /(?:alternativa|resposta)\s+(?:correta|é)\s+(?:é\s+)?([A-E])/i,
        priority: 2,
      },
      {
        name: "Letra X) está correta",
        regex: /(?:letra|alternativa)\s+([A-E])\)?\s+(?:está\s+)?(?:correta|é\s+a\s+resposta)/i,
        priority: 3,
      },
      {
        name: "Portanto X ou Logo X",
        regex: /(?:portanto|logo|assim|então)[\s,]*(?:a\s+resposta\s+é\s+)?([A-E])/i,
        priority: 4,
      },
      {
        name: "Última letra mencionada",
        regex: /\b([A-E])\b(?!.*\b[A-E]\b)/i,
        priority: 5,
      },
    ]

    // Testar cada estratégia
    for (const strategy of strategies) {
      const match = reasoning.match(strategy.regex)
      if (match) {
        const letter = match[1].toUpperCase()
        log("INFO", `✅ RESPOSTA EXTRAÍDA: "${letter}"`)
        log("INFO", `🎯 Estratégia: ${strategy.name} (prioridade ${strategy.priority})`)
        log("INFO", `🔍 Match:`, match[0])
        return { answer: letter, reasoning: reasoning }
      } else {
        log("INFO", `❌ Estratégia "${strategy.name}" não funcionou`)
      }
    }

    // Se não encontrou, tentar extrair do final do texto
    const lines = reasoning.split("\n").filter((line) => line.trim())
    const lastLine = lines[lines.length - 1]
    const lastLineMatch = lastLine.match(/([A-E])/i)

    if (lastLineMatch) {
      const letter = lastLineMatch[1].toUpperCase()
      log("INFO", `✅ RESPOSTA EXTRAÍDA DA ÚLTIMA LINHA: "${letter}"`)
      log("INFO", `📝 Última linha: "${lastLine}"`)
      return { answer: letter, reasoning: reasoning }
    }

    log("ERROR", "❌ NÃO FOI POSSÍVEL EXTRAIR RESPOSTA DO RACIOCÍNIO!")
    log("ERROR", "📝 Raciocínio:", reasoning.substring(0, 500) + "...")
    return { answer: null, reasoning: reasoning }
  }

  // Função para salvar no cache
  async function saveToCache(question, response, model, isCorrect = true) {
    try {
      log("INFO", "💾 SALVANDO NO CACHE:", { question: question.substring(0, 50) + "...", response, model })

      const payload = {
        action: "save",
        question: question,
        response: response,
        model: model,
        isCorrect: isCorrect,
        timestamp: new Date().toISOString(),
      }

      const res = await fetch(CONFIG.CACHE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        log("INFO", "✅ SALVO NO CACHE COM SUCESSO:", data)
        return data
      } else {
        log("WARN", "⚠️ FALHA AO SALVAR NO CACHE:", res.status)
      }
    } catch (error) {
      log("ERROR", "❌ ERRO AO SALVAR NO CACHE:", error)
    }
    return null
  }

  // Função para marcar resposta como incorreta
  async function markIncorrect(cacheId) {
    try {
      log("INFO", "❌ MARCANDO COMO INCORRETA:", cacheId)

      const payload = {
        action: "mark_incorrect",
        questionHash: cacheId,
      }

      const res = await fetch(CONFIG.CACHE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        log("INFO", "✅ MARCADA COMO INCORRETA")
        STATE.ui.notify({
          id: "marked_incorrect",
          text: "❌ Marcada como Incorreta",
          detail: "Use [7] para corrigir",
          type: "warn",
        })
        return true
      }
    } catch (error) {
      log("ERROR", "❌ ERRO AO MARCAR INCORRETA:", error)
    }
    return false
  }

  // Função para corrigir resposta
  async function correctResponse(cacheId, correctedAnswer) {
    try {
      log("INFO", "✅ CORRIGINDO RESPOSTA:", { cacheId, correctedAnswer })

      const payload = {
        action: "correct",
        questionHash: cacheId,
        correctedResponse: correctedAnswer,
      }

      const res = await fetch(CONFIG.CACHE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        log("INFO", "✅ RESPOSTA CORRIGIDA")
        STATE.ui.notify({
          id: "corrected",
          text: "✅ Resposta Corrigida",
          detail: `Nova resposta: ${correctedAnswer}`,
          type: "success",
        })
        return true
      }
    } catch (error) {
      log("ERROR", "❌ ERRO AO CORRIGIR:", error)
    }
    return false
  }

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
        const src = node.src || node.dataset.src || node.getAttribute("data-src")
        log("INFO", "🖼️ IMAGEM ENCONTRADA:", {
          src: src,
          alt: node.alt,
          width: node.width || node.offsetWidth,
          height: node.height || node.offsetHeight,
          visible: node.offsetParent !== null,
          complete: node.complete,
          naturalWidth: node.naturalWidth,
          naturalHeight: node.naturalHeight,
        })

        if (!src) {
          log("WARN", "⚠️ IMAGEM SEM SRC:", node)
          return ""
        }

        const url = new URL(src, window.location.href).toString()

        // FILTRO MAIS PERMISSIVO - apenas bloquear logos e ícones óbvios
        const isIrrelevant =
          /(_logo|favicon|icon-|btn-|button-|banner-|avatar-|profile-|captcha|loading|spinner|\.svg$)/i.test(url)

        if (!isIrrelevant) {
          STATE.imageCount++
          log("INFO", `✅ IMAGEM RELEVANTE #${STATE.imageCount}:`, {
            url: url,
            alt: node.alt,
            dimensions: `${node.naturalWidth || node.width}x${node.naturalHeight || node.height}`,
          })
          return ` [IMAGEM]: ${url} `
        } else {
          log("INFO", "❌ IMAGEM FILTRADA (irrelevante):", url)
          return ""
        }
      } catch (e) {
        log("ERROR", "❌ ERRO AO PROCESSAR IMAGEM:", e, node)
        return ""
      }
    }

    if (node.matches && node.matches("mjx-container, .MathJax, .katex, math")) {
      const latex =
        node.getAttribute("aria-label") ||
        node.dataset.latex ||
        node.querySelector('annotation[encoding*="tex"]')?.textContent
      if (latex?.trim()) {
        log("INFO", "📐 FÓRMULA MATEMÁTICA ENCONTRADA:", latex.trim())
        return ` $${latex.trim()}$ `
      }
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
    log("INFO", "🔍 INICIANDO EXTRAÇÃO DE QUESTÃO...")
    STATE.imageCount = 0 // Reset contador de imagens

    let card = null
    const selectors =
      'div.MuiPaper-root, article[class*="question"], section[class*="assessment"], div[class*="questao"], .question-container, .assessment-item'

    for (const c of document.querySelectorAll(selectors)) {
      if (c.closest("#" + HCK_ID)) continue
      if (c.querySelector('div[role="radiogroup"], ul[class*="option"], ol[class*="choice"], input[type="radio"]')) {
        card = c
        log("INFO", "📋 CARD DA QUESTÃO ENCONTRADO:", c.className)
        break
      }
    }

    if (!card) {
      // Fallback mais agressivo - procurar por qualquer container com alternativas
      const radioInputs = document.querySelectorAll('input[type="radio"]')
      if (radioInputs.length > 0) {
        card = radioInputs[0].closest("div, section, article") || document.body
        log("INFO", "📋 CARD ENCONTRADO VIA RADIO INPUTS:", card.tagName)
      } else {
        card = document.body
        log("WARN", "⚠️ USANDO DOCUMENT.BODY COMO FALLBACK")
      }
    }

    // Verificar imagens no card antes da extração
    const images = card.querySelectorAll("img")
    log("INFO", `🖼️ TOTAL DE IMAGENS NO CARD: ${images.length}`)

    // NOVA ESTRATÉGIA: Extrair TUDO primeiro, depois separar
    let fullContent = ""
    let statement = ""
    const alternatives = []

    // 1. Extrair todo o conteúdo do card
    fullContent = getContent(card)
    log("INFO", "📄 CONTEÚDO COMPLETO EXTRAÍDO:", fullContent.length, "caracteres")

    // 2. Tentar separar enunciado das alternativas
    const lines = fullContent.split("\n").filter((line) => line.trim().length > 0)
    log("INFO", "📝 TOTAL DE LINHAS:", lines.length)

    let alternativeStartIndex = -1
    let foundAlternatives = false

    // Procurar onde começam as alternativas
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // Detectar início das alternativas (A), B), etc.)
      if (/^[A-E]\s*[).]\s*.+/.test(line)) {
        alternativeStartIndex = i
        foundAlternatives = true
        log("INFO", `🔘 ALTERNATIVAS COMEÇAM NA LINHA ${i}: ${line.substring(0, 50)}...`)
        break
      }
    }

    if (foundAlternatives && alternativeStartIndex > 0) {
      // Separar enunciado (antes das alternativas) das alternativas
      statement = lines.slice(0, alternativeStartIndex).join("\n").trim()

      // Extrair alternativas
      for (let i = alternativeStartIndex; i < lines.length && alternatives.length < 5; i++) {
        const line = lines[i].trim()
        if (/^[A-E]\s*[).]\s*.+/.test(line)) {
          const letter = String.fromCharCode(65 + alternatives.length)
          const content = line.replace(/^[A-E]\s*[).]\s*/, "").trim()
          if (content.length > 0) {
            alternatives.push(`${letter}) ${content}`)
            log("INFO", `🔘 ALTERNATIVA ${letter} EXTRAÍDA:`, content.substring(0, 100) + "...")
          }
        }
      }
    } else {
      // Fallback: usar estratégia anterior se não conseguir separar
      log("WARN", "⚠️ NÃO CONSEGUIU SEPARAR - USANDO ESTRATÉGIA ANTERIOR")

      const statementEl = card.querySelector(
        '.ql-editor, div[class*="enunciado"], .question-statement, .texto-base, .question-text',
      )

      if (statementEl && !statementEl.closest('div[role="radiogroup"]')) {
        log("INFO", "📝 ENUNCIADO ENCONTRADO EM ELEMENTO ESPECÍFICO")
        statement = getContent(statementEl)
      } else {
        // Usar todo o conteúdo como enunciado se não conseguir separar
        statement = fullContent
        log("INFO", "📝 USANDO CONTEÚDO COMPLETO COMO ENUNCIADO")
      }

      // Tentar extrair alternativas do DOM
      const radioGroup = card.querySelector('div[role="radiogroup"], ul[class*="option"], ol[class*="choice"]')
      if (radioGroup) {
        const items = Array.from(radioGroup.children).filter((el) => el.matches("div, label, li"))
        items.forEach((item, index) => {
          if (alternatives.length >= 5) return
          const letter = String.fromCharCode(65 + alternatives.length)
          let content = sanitize(getContent(item))
            .replace(/^[A-Ea-e][).]\s*/, "")
            .trim()

          if (content.length < 3) {
            content = item.textContent
              .trim()
              .replace(/^[A-Ea-e][).]\s*/, "")
              .trim()
          }

          if (content && content.length > 1) {
            alternatives.push(`${letter}) ${content}`)
            log("INFO", `🔘 ALTERNATIVA ${letter} EXTRAÍDA (DOM):`, content.substring(0, 100) + "...")
          }
        })
      }
    }

    statement = sanitize(statement)

    // Log final da extração
    log("INFO", "📊 RESUMO DA EXTRAÇÃO:", {
      enunciadoLength: statement.length,
      alternativasCount: alternatives.length,
      imagensEncontradas: STATE.imageCount,
      temConteudoSuficiente: statement.length >= 10 || alternatives.length >= 2,
    })

    if (statement.length < 10 && alternatives.length < 2) {
      log("ERROR", "❌ FALHA NA EXTRAÇÃO: CONTEÚDO INSUFICIENTE")
      return "Falha na extração: conteúdo insuficiente."
    }

    const finalQuestion =
      `--- Enunciado ---\n${statement || "(Vazio)"}\n\n--- Alternativas ---\n${alternatives.join("\n") || "(Nenhuma)"}`.replace(
        /\n{3,}/g,
        "\n\n",
      )

    // Salvar questão no estado para cache posterior
    STATE.lastQuestion = finalQuestion

    // Log da questão final (primeiros 800 chars para ver mais conteúdo)
    log("INFO", "✅ QUESTÃO FINAL EXTRAÍDA:")
    log("INFO", finalQuestion.substring(0, 1000) + "...")

    if (STATE.imageCount > 0) {
      log("INFO", `🖼️ QUESTÃO COM VISÃO: ${STATE.imageCount} imagem(ns) incluída(s)`)
      STATE.ui.notify({
        id: "vision_detected",
        text: `🖼️ Visão Detectada`,
        detail: `${STATE.imageCount} imagem(ns) encontrada(s)`,
        type: "info",
      })
    }

    return finalQuestion
  }

  async function queryApi(text, modelId) {
    log("INFO", "🚀 ENVIANDO PARA API:")
    log("INFO", "📝 Modelo:", modelId)
    log("INFO", "📏 Tamanho do texto:", text.length, "caracteres")
    log("INFO", "🖼️ Tem imagens:", text.includes("[IMAGEM]"))
    log("INFO", "🔢 Quantidade de imagens:", (text.match(/\[IMAGEM\]/g) || []).length)

    const payload = { messages: [{ role: "user", content: text }], modelId: modelId }

    try {
      const res = await fetch(CONFIG.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      log("INFO", "📥 RESPOSTA COMPLETA DA API:")
      log("INFO", "🌐 Status:", res.status)
      log("INFO", "✅ OK:", res.ok)
      log("INFO", "📝 Response:", data.response)
      log("INFO", "🏷️ Source:", data.source)
      log("INFO", "🤖 Model:", data.model)
      log("INFO", "🆔 Cache ID:", data.cacheId)
      log("INFO", "📊 Details:", data.details)

      if (!res.ok) {
        log("ERROR", "❌ ERRO HTTP DA API:", data)
        throw new Error(data?.message || `Erro HTTP ${res.status}`)
      }

      if (data.response) {
        // Salvar informações para cache
        STATE.lastResponse = data.response
        STATE.lastCacheId = data.cacheId
        return data
      }

      log("ERROR", "❌ API RETORNOU RESPOSTA INVÁLIDA:", data)
      throw new Error("API retornou resposta inválida.")
    } catch (error) {
      log("ERROR", "❌ ERRO NA REQUISIÇÃO:", error)
      throw error
    }
  }

  const PULSE_CLASS = "hck-pulse-visual"

  function applyPulse(letter) {
    document.querySelectorAll("." + PULSE_CLASS).forEach((e) => e.classList.remove(PULSE_CLASS))
    if (!letter) return
    const index = letter.charCodeAt(0) - 65
    const alts = document.querySelectorAll(
      'div[role="radiogroup"] > label, div[role="radiogroup"] > div, ul[class*="option"] > li, ol[class*="choice"] > li, input[type="radio"]',
    )
    if (alts[index]) {
      const target = alts[index].querySelector(".MuiRadio-root, input[type=radio]") || alts[index]
      target.classList.add(PULSE_CLASS)
    }
  }

  function cycleModel() {
    if (STATE.isRunning) return
    STATE.currentModelIndex = (STATE.currentModelIndex + 1) % CONFIG.MODELS.length
    const newModel = CONFIG.MODELS[STATE.currentModelIndex]
    STATE.ui.updateModelDisplay(newModel.name)
    STATE.ui.notify({ id: "model_change", text: "Modelo Alterado", detail: newModel.name, type: "info" })
    log("INFO", "🔄 MODELO ALTERADO PARA:", newModel)
  }

  // Função para mostrar raciocínio
  function showReasoning() {
    if (STATE.isRunning) return
    if (STATE.lastReasoning) {
      // Criar popup com o raciocínio
      const popup = document.createElement("div")
      popup.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(16, 16, 24, 0.95); color: #E2E2FF; padding: 20px;
        border-radius: 10px; max-width: 80vw; max-height: 80vh; overflow-y: auto;
        z-index: 2147483648; border: 1px solid #333344; box-shadow: 0 8px 30px rgba(0,0,0,0.8);
        font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.5;
      `
      popup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: #C77DFF;">🧠 Raciocínio da IA</h3>
          <button onclick="this.parentElement.parentElement.remove()" style="background: #F50057; color: white; border: none; border-radius: 5px; padding: 5px 10px; cursor: pointer;">✕</button>
        </div>
        <div style="white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border-left: 4px solid #C77DFF;">
          ${STATE.lastReasoning}
        </div>
      `
      document.body.appendChild(popup)

      STATE.ui.notify({
        id: "reasoning_shown",
        text: "🧠 Raciocínio Exibido",
        detail: "Clique no X para fechar",
        type: "info",
      })
    } else {
      STATE.ui.notify({
        id: "no_reasoning",
        text: "❌ Sem Raciocínio",
        detail: "Execute uma questão primeiro",
        type: "warn",
      })
    }
  }

  // Função para marcar como incorreta
  function markAsIncorrect() {
    if (STATE.isRunning || !STATE.lastCacheId) {
      STATE.ui.notify({
        id: "no_cache_id",
        text: "❌ Sem Resposta para Marcar",
        detail: "Execute uma questão primeiro",
        type: "warn",
      })
      return
    }
    markIncorrect(STATE.lastCacheId)
  }

  // Função para corrigir resposta
  function promptCorrection() {
    if (STATE.isRunning || !STATE.lastCacheId) {
      STATE.ui.notify({
        id: "no_cache_id",
        text: "❌ Sem Resposta para Corrigir",
        detail: "Execute uma questão primeiro",
        type: "warn",
      })
      return
    }

    const correctedAnswer = prompt("Digite a resposta correta (A, B, C, D ou E):")
    if (correctedAnswer && /^[A-E]$/i.test(correctedAnswer.trim())) {
      correctResponse(STATE.lastCacheId, correctedAnswer.toUpperCase())
    } else if (correctedAnswer) {
      STATE.ui.notify({
        id: "invalid_correction",
        text: "❌ Resposta Inválida",
        detail: "Use apenas A, B, C, D ou E",
        type: "error",
      })
    }
  }

  async function run() {
    if (STATE.isRunning) return
    STATE.isRunning = true
    STATE.lastAnswer = null
    STATE.lastReasoning = null
    applyPulse(null)

    const currentModel = CONFIG.MODELS[STATE.currentModelIndex]
    log("INFO", "▶️ INICIANDO EXECUÇÃO COM MODELO:", currentModel)

    STATE.ui.notify({
      id: "processing_status",
      text: "🧠 Analisando...",
      detail: `IA está raciocinando com ${currentModel.name}`,
      type: "processing",
    })

    try {
      const question = extractQuestion()
      if (question.startsWith("Falha")) throw new Error(question)

      const result = await withTimeout(queryApi(question, currentModel.id), CONFIG.API_TIMEOUT)

      // Extrair resposta do raciocínio
      log("INFO", "🧠 EXTRAINDO RESPOSTA DO RACIOCÍNIO:")
      const { answer, reasoning } = extractAnswerFromReasoning(result.response)

      const icon = result.source === "database_cache" || result.source === "corrected_cache" ? "💾" : "🧠"
      const modelName = result.model
        ? result.model
            .split("/")
            .pop()
            .replace(/-latest$/, "")
        : "IA"
      const detail =
        result.source === "database_cache" || result.source === "corrected_cache"
          ? `Do cache (por ${result.details?.modelOrigin?.split("/").pop() || modelName})`
          : `Analisado por ${modelName}`

      log("INFO", "✅ PROCESSAMENTO CONCLUÍDO:")
      log("INFO", "🎯 Resposta final:", answer)
      log("INFO", "🧠 Tem raciocínio:", !!reasoning)
      log("INFO", "🏷️ Source:", result.source)
      log("INFO", "🤖 Model:", modelName)
      log("INFO", "🖼️ Had images:", STATE.imageCount > 0)
      log("INFO", "🆔 Cache ID:", result.cacheId)

      if (answer) {
        STATE.lastAnswer = answer
        const successDetail = STATE.imageCount > 0 ? `${detail} • ${STATE.imageCount} imagem(ns)` : detail
        STATE.ui.notify({
          id: "processing_status",
          text: `${icon} Resposta: ${answer}`,
          detail: successDetail + " • [8] Ver raciocínio",
          type: "success",
        })

        // Se não veio do cache, salvar no nosso cache
        if (result.source === "live_api" && STATE.lastQuestion) {
          await saveToCache(STATE.lastQuestion, answer, currentModel.id, true)
        }
      } else {
        log("ERROR", "❌ NÃO FOI POSSÍVEL EXTRAIR RESPOSTA:")
        log("ERROR", "📝 Raciocínio:", result.response)
        STATE.ui.notify({
          id: "processing_status",
          text: "❌ Falha na Extração",
          detail: "IA respondeu mas não consegui extrair A-E",
          type: "error",
        })
      }
    } catch (error) {
      log("ERROR", "❌ FALHA NO CICLO:", error)
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
    log("INFO", "🛑 ENCERRANDO HCK...")
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
      5: kill,
      6: markAsIncorrect,
      7: promptCorrection,
      8: showReasoning,
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
    style.textContent = `@keyframes hck-pulse-anim{to{box-shadow:0 0 0 12px transparent;}} .${PULSE_CLASS}{border-radius:50%; animation: hck-pulse-anim 1.2s infinite; box-shadow: 0 0 0 0 ${C.pulse};} @keyframes hck-fade-in{from{opacity:0;transform:scale(0.95) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}} @keyframes hck-progress-bar{from{width:100%;}to{width:0%;}}`
    document.head.appendChild(style)

    const container = document.createElement("div")
    container.id = HCK_ID
    container.style.cssText = `position:fixed; bottom:20px; right:20px; z-index:2147483647; font-family:${C.font}; animation:hck-fade-in .4s ease-out;`

    const menu = document.createElement("div")
    menu.style.cssText = `width:320px; background:${C.bg}; backdrop-filter:blur(10px); color:${C.text}; padding:10px; border-radius:10px; border:1px solid ${C.border}; box-shadow:${C.shadow}; display:none; flex-direction:column; gap:8px; transition: all .3s ease-out; position:absolute; bottom:calc(100% + 10px); right:0; opacity:0; transform-origin: bottom right;`

    const titleBar = document.createElement("div")
    titleBar.innerHTML = `<div style="font-weight:600; font-size:14px; background:${C.grad}; -webkit-background-clip:text; -webkit-text-fill-color:transparent;">HCK - PROVA PAULISTA V3</div><div style="font-size:9px; color:${C.text2}; align-self:flex-end;">v${SCRIPT_VERSION}</div>`
    titleBar.style.cssText = `display:flex; justify-content:space-between; align-items:center;`

    const modelDisplay = document.createElement("div")
    modelDisplay.style.cssText = `font-size:11px; color:${C.text2}; text-align:center; background:rgba(0,0,0,0.2); padding: 5px; border-radius: 6px; border: 1px solid ${C.border}; margin-top: 8px;`

    const shortcuts = document.createElement("div")
    shortcuts.innerHTML = `<div style="display:grid; grid-template-columns:auto 1fr; gap:5px 12px; font-size:11px; color:${C.text2}; margin-top:8px; padding-top:8px; border-top: 1px solid ${C.border};"><b style="color:${C.text};">[1]</b>Menu <b style="color:${C.text};">[2]</b>Analisar <b style="color:${C.text};">[3]</b>Marcar <b style="color:${C.text};">[4]</b>Modelo <b style="color:${C.text};">[5]</b>Sair <b style="color:${C.text};">[6]</b>Incorreta <b style="color:${C.text};">[7]</b>Corrigir <b style="color:${C.text};">[8]</b>Raciocínio</div>`

    const credits = document.createElement("div")
    credits.innerHTML = `by <b style="background:${C.grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Hackermoon1</b> & <b style="background:${C.grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Dontbrazz</b>`
    credits.style.cssText = `font-size:10px; color:${C.text2}; opacity:0.7; text-align:center; padding-top:8px; margin-top:5px; border-top: 1px solid ${C.border};`

    menu.append(titleBar, modelDisplay, shortcuts, credits)

    const toggleBtn = document.createElement("button")
    toggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
    toggleBtn.style.cssText = `background:${C.bg}; color:${C.text2}; width:42px; height:42px; border:1px solid ${C.border}; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.3); transition: all .3s ease; opacity: 0.8;`
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

    const updateModelDisplay = (modelName) => {
      modelDisplay.innerHTML = `Modelo: <strong style="color:${C.text};">${modelName}</strong>`
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
      n.style.cssText = `width:320px; background:rgba(22, 22, 30, 0.9); backdrop-filter:blur(10px); color:${C.text}; padding:12px 16px; border-radius:10px; box-shadow:${C.shadow}; display:flex; flex-direction:column; gap:4px; opacity:0; transform:translateX(20px); transition:all .4s cubic-bezier(0.2, 1, 0.4, 1); border-left:4px solid ${color}; cursor:pointer; font-size:14px; overflow:hidden;`
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

    return { notify, updateModelDisplay, toggleMenu }
  }

  try {
    STATE.ui = setupUI()
    document.addEventListener("keydown", handleKeys, true)
    log("INFO", `----- HCK - PROVA PAULISTA V3 (v${SCRIPT_VERSION}) Activated -----`)
    STATE.ui.updateModelDisplay(CONFIG.MODELS[STATE.currentModelIndex].name)
    STATE.ui.notify({
      text: "🧠 HCK V3 Ativado",
      detail: "Agora a IA raciocina! Pressione [1] para menu",
      type: "success",
    })
  } catch (e) {
    console.error("HCK Init Fail:", e)
  }
})()
