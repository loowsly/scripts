javascript: (() => {
  const SCRIPT_ID = "simple-ai-assistant"

  // Remove se já existe
  const existing = document.getElementById(SCRIPT_ID)
  if (existing) {
    existing.remove()
    return
  }

  const CONFIG = {
    API_URL: "https://v0-openrouter-ai-endpoint.vercel.app/api/chat",
    MODELS: [
      { id: "gpt-4o-mini", name: "GPT-4O Mini (Rápido)" },
      { id: "gpt-4o", name: "GPT-4O (Inteligente)" },
      { id: "gemini-flash", name: "Gemini Flash (Visão)" },
      { id: "claude-sonnet", name: "Claude Sonnet (Analítico)" },
      { id: "deepseek", name: "DeepSeek (Eficiente)" },
    ],
    LANGUAGES: [
      { id: "pt", name: "🇧🇷 Português" },
      { id: "en", name: "🇺🇸 English" },
      { id: "es", name: "🇪🇸 Español" },
    ],
  }

  const STATE = {
    currentModel: 0,
    currentLanguage: 0,
    isProcessing: false,
    lastAnswer: null,
  }

  // Função para extrair conteúdo da página
  function extractContent() {
    const images = []
    const textContent = []

    // Procurar por container da questão
    const containers = document.querySelectorAll(
      'div[class*="question"], div[class*="questao"], .MuiPaper-root, article, main, section',
    )
    let mainContainer = null

    for (const container of containers) {
      if (container.querySelector('input[type="radio"], div[role="radiogroup"]')) {
        mainContainer = container
        break
      }
    }

    if (!mainContainer) {
      mainContainer = document.body
    }

    console.log("📋 Container encontrado:", mainContainer.tagName, mainContainer.className)

    // Extrair imagens
    mainContainer.querySelectorAll("img").forEach((img) => {
      if (img.src && !img.src.includes("icon") && !img.src.includes("logo") && !img.src.includes("avatar")) {
        images.push(img.src)
        console.log("🖼️ Imagem encontrada:", img.src)
      }
    })

    // Extrair texto de forma mais robusta
    const walker = document.createTreeWalker(mainContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        const style = window.getComputedStyle(parent)
        if (style.display === "none" || style.visibility === "hidden") {
          return NodeFilter.FILTER_REJECT
        }

        // Ignorar scripts e estilos
        if (parent.tagName === "SCRIPT" || parent.tagName === "STYLE") {
          return NodeFilter.FILTER_REJECT
        }

        return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })

    let node
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim()
      if (text.length > 2) {
        textContent.push(text)
      }
    }

    const finalText = textContent.join(" ").replace(/\s+/g, " ").trim()
    console.log("📝 Texto extraído:", finalText.substring(0, 200) + "...")

    return {
      text: finalText,
      images: images,
    }
  }

  // Função para enviar para API
  async function sendToAI(content) {
    const model = CONFIG.MODELS[STATE.currentModel]
    const language = CONFIG.LANGUAGES[STATE.currentLanguage]

    console.log("🚀 Enviando para API:", {
      model: model.name,
      language: language.name,
      hasImages: content.images.length > 0,
    })

    const messages = []

    if (content.images.length > 0) {
      // Mensagem com imagens
      const messageContent = [{ type: "text", text: content.text }]

      content.images.forEach((imageUrl) => {
        messageContent.push({
          type: "image_url",
          image_url: { url: imageUrl },
        })
      })

      messages.push({
        role: "user",
        content: messageContent,
      })
    } else {
      // Apenas texto
      messages.push({
        role: "user",
        content: content.text,
      })
    }

    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: messages,
        model: model.id,
        language: language.id,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ Erro da API:", response.status, errorText)
      throw new Error(`API Error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("✅ Resposta da API:", data)
    return data.response
  }

  // Função para extrair letra da resposta
  function extractLetter(response) {
    console.log("🔍 Extraindo letra de:", response)

    // Estratégias múltiplas para encontrar a letra
    const strategies = [
      /(?:resposta|answer|letra)[\s:]*([A-E])/i,
      /\b([A-E])\b(?!.*\b[A-E]\b)/i,
      /^([A-E])\b/im,
      /\b([A-E])\)/,
      /\b([A-E])\b/i,
    ]

    for (const regex of strategies) {
      const match = response.match(regex)
      if (match) {
        const letter = match[1].toUpperCase()
        console.log("✅ Letra encontrada:", letter)
        return letter
      }
    }

    console.log("❌ Nenhuma letra encontrada")
    return null
  }

  // Função para marcar resposta
  function markAnswer(letter) {
    if (!letter) return

    console.log("🎯 Marcando resposta:", letter)

    const index = letter.charCodeAt(0) - 65
    const selectors = [
      'input[type="radio"]',
      'div[role="radiogroup"] > *',
      "ul li",
      "ol li",
      "label",
      '[class*="option"]',
      '[class*="alternativa"]',
    ]

    let found = false
    for (const selector of selectors) {
      const options = document.querySelectorAll(selector)
      if (options[index]) {
        const target = options[index].querySelector('input[type="radio"]') || options[index]
        target.style.cssText += `
          animation: pulse 2s infinite !important;
          box-shadow: 0 0 0 4px #ff4444 !important;
          border-radius: 50% !important;
          background-color: #ff4444 !important;
          transform: scale(1.2) !important;
        `
        console.log("✅ Resposta marcada:", target)
        found = true
        break
      }
    }

    if (!found) {
      console.log("❌ Não foi possível marcar a resposta")
    }
  }

  // Função principal
  async function processQuestion() {
    if (STATE.isProcessing) return

    STATE.isProcessing = true
    updateStatus("🤖 Analisando...")

    try {
      const content = extractContent()

      if (!content.text || content.text.length < 10) {
        throw new Error("Conteúdo insuficiente encontrado")
      }

      const response = await sendToAI(content)
      const letter = extractLetter(response)

      if (letter) {
        STATE.lastAnswer = letter
        markAnswer(letter)
        updateStatus(`✅ Resposta: ${letter}`)
      } else {
        updateStatus("❌ Não foi possível extrair resposta")
        console.log("🤖 Resposta completa da IA:", response)
      }
    } catch (error) {
      console.error("❌ Erro:", error)
      updateStatus(`❌ Erro: ${error.message}`)
    } finally {
      STATE.isProcessing = false
    }
  }

  // Função para alternar modelo
  function cycleModel() {
    STATE.currentModel = (STATE.currentModel + 1) % CONFIG.MODELS.length
    updateModelDisplay()
    console.log("🔄 Modelo alterado para:", CONFIG.MODELS[STATE.currentModel].name)
  }

  // Função para alternar idioma
  function cycleLanguage() {
    STATE.currentLanguage = (STATE.currentLanguage + 1) % CONFIG.LANGUAGES.length
    updateLanguageDisplay()
    console.log("🌍 Idioma alterado para:", CONFIG.LANGUAGES[STATE.currentLanguage].name)
  }

  // Função para atualizar displays
  function updateModelDisplay() {
    const model = CONFIG.MODELS[STATE.currentModel]
    document.getElementById("model-display").textContent = model.name
  }

  function updateLanguageDisplay() {
    const language = CONFIG.LANGUAGES[STATE.currentLanguage]
    document.getElementById("language-display").textContent = language.name
  }

  function updateStatus(text) {
    document.getElementById("status-display").textContent = text
  }

  // Função para remover script
  function removeScript() {
    console.log("👋 Removendo AI Assistant")
    document.getElementById(SCRIPT_ID)?.remove()
    document.removeEventListener("keydown", handleKeyPress)
  }

  // Handler de teclas
  function handleKeyPress(e) {
    if (e.target.matches("input, textarea, [contenteditable]")) return

    switch (e.key) {
      case "1":
        e.preventDefault()
        removeScript()
        break
      case "2":
        e.preventDefault()
        processQuestion()
        break
      case "3":
        e.preventDefault()
        cycleModel()
        break
      case "4":
        e.preventDefault()
        cycleLanguage()
        break
    }
  }

  // Criar interface
  function createUI() {
    const container = document.createElement("div")
    container.id = SCRIPT_ID
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px;
      border-radius: 10px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      min-width: 250px;
      backdrop-filter: blur(10px);
    `

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 10px;">
        <div style="font-weight: bold; font-size: 14px;">🤖 AI Assistant</div>
        <div style="font-size: 10px; opacity: 0.8;">Pressione [2] para analisar</div>
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-size: 10px; opacity: 0.8;">Modelo:</div>
        <div id="model-display" style="font-weight: bold;"></div>
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-size: 10px; opacity: 0.8;">Idioma:</div>
        <div id="language-display" style="font-weight: bold;"></div>
      </div>
      
      <div style="margin-bottom: 10px;">
        <div id="status-display" style="font-size: 11px; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 5px;">
          Pronto para analisar
        </div>
      </div>
      
      <div style="font-size: 10px; opacity: 0.7; line-height: 1.3;">
        [1] Sair • [2] Analisar<br>
        [3] Modelo • [4] Idioma
      </div>
    `

    document.body.appendChild(container)

    // Inicializar displays
    updateModelDisplay()
    updateLanguageDisplay()

    // Adicionar event listener
    document.addEventListener("keydown", handleKeyPress)

    // Adicionar animação de pulso
    const style = document.createElement("style")
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
    `
    document.head.appendChild(style)

    console.log("🤖 AI Assistant ativado!")
    console.log("📋 Controles:")
    console.log("  [1] - Sair")
    console.log("  [2] - Analisar questão")
    console.log("  [3] - Trocar modelo")
    console.log("  [4] - Trocar idioma")
  }

  // Inicializar
  createUI()
})()
