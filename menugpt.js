javascript: (() => {
  const CHAT_ID = "ai-chat-sidebar"

  // Remove se já existe
  const existing = document.getElementById(CHAT_ID)
  if (existing) {
    existing.remove()
    return
  }

  const CONFIG = {
    API_URL: "https://v0-openrouter-ai-endpoint.vercel.app/api/chat",
    MODELS: [
      { id: "gpt-4o-mini", name: "GPT-4O Mini" },
      { id: "gpt-4o", name: "GPT-4O" },
      { id: "gemini-flash", name: "Gemini Flash" },
      { id: "claude-sonnet", name: "Claude Sonnet" },
    ],
  }

  const STATE = {
    currentModel: 0,
    messages: [],
    isProcessing: false,
  }

  // Função para enviar mensagem
  async function sendMessage(content, images = []) {
    if (STATE.isProcessing) return

    STATE.isProcessing = true

    // Adicionar mensagem do usuário
    const userMessage = { role: "user", content, images, timestamp: Date.now() }
    STATE.messages.push(userMessage)
    addMessageToChat(userMessage)

    // Mostrar loading
    const loadingId = addLoadingMessage()

    try {
      const model = CONFIG.MODELS[STATE.currentModel]

      // Preparar mensagens para API
      const apiMessages = []

      if (images.length > 0) {
        const messageContent = [{ type: "text", text: content }]
        images.forEach((img) => {
          messageContent.push({
            type: "image_url",
            image_url: { url: img },
          })
        })
        apiMessages.push({ role: "user", content: messageContent })
      } else {
        apiMessages.push({ role: "user", content })
      }

      const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          model: model.id,
          language: "pt",
        }),
      })

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`)
      }

      const data = await response.json()

      // Adicionar resposta da IA
      const aiMessage = {
        role: "assistant",
        content: data.response,
        model: model.name,
        timestamp: Date.now(),
      }
      STATE.messages.push(aiMessage)

      removeLoadingMessage(loadingId)
      addMessageToChat(aiMessage)
    } catch (error) {
      removeLoadingMessage(loadingId)
      addMessageToChat({
        role: "error",
        content: `Erro: ${error.message}`,
        timestamp: Date.now(),
      })
    } finally {
      STATE.isProcessing = false
    }
  }

  // Função para adicionar mensagem ao chat
  function addMessageToChat(message) {
    const chatMessages = document.getElementById("chat-messages")
    const messageDiv = document.createElement("div")

    const isUser = message.role === "user"
    const isError = message.role === "error"

    messageDiv.style.cssText = `
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 8px;
      max-width: 85%;
      word-wrap: break-word;
      ${
        isUser
          ? "background: #007bff; color: white; margin-left: auto; text-align: right;"
          : isError
            ? "background: #dc3545; color: white;"
            : "background: #f8f9fa; color: #333; border: 1px solid #dee2e6;"
      }
    `

    let content = message.content

    // Mostrar imagens se houver
    if (message.images && message.images.length > 0) {
      const imagesHtml = message.images
        .map(
          (img) => `<img src="${img}" style="max-width: 100px; max-height: 100px; margin: 5px; border-radius: 4px;" />`,
        )
        .join("")
      content = imagesHtml + "<br>" + content
    }

    // Adicionar info do modelo se for resposta da IA
    if (message.role === "assistant" && message.model) {
      content += `<div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">via ${message.model}</div>`
    }

    messageDiv.innerHTML = content
    chatMessages.appendChild(messageDiv)
    chatMessages.scrollTop = chatMessages.scrollHeight
  }

  // Função para adicionar loading
  function addLoadingMessage() {
    const chatMessages = document.getElementById("chat-messages")
    const loadingDiv = document.createElement("div")
    const loadingId = `loading-${Date.now()}`

    loadingDiv.id = loadingId
    loadingDiv.style.cssText = `
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 8px;
      background: #f8f9fa;
      color: #666;
      border: 1px solid #dee2e6;
      max-width: 85%;
    `
    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; background: #007bff; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
        <div style="width: 8px; height: 8px; background: #007bff; border-radius: 50%; animation: pulse 1.5s infinite 0.2s;"></div>
        <div style="width: 8px; height: 8px; background: #007bff; border-radius: 50%; animation: pulse 1.5s infinite 0.4s;"></div>
        <span>IA pensando...</span>
      </div>
    `

    chatMessages.appendChild(loadingDiv)
    chatMessages.scrollTop = chatMessages.scrollHeight
    return loadingId
  }

  // Função para remover loading
  function removeLoadingMessage(loadingId) {
    document.getElementById(loadingId)?.remove()
  }

  // Função para processar imagens coladas
  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return

    const images = []
    const texts = []

    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile()
        const reader = new FileReader()
        reader.onload = (event) => {
          images.push(event.target.result)
          if (images.length === 1) {
            // Primeira imagem
            document.getElementById("chat-input").placeholder =
              `${images.length} imagem(ns) colada(s). Digite sua pergunta...`
          }
        }
        reader.readAsDataURL(file)
      } else if (item.type === "text/plain") {
        item.getAsString((text) => {
          texts.push(text)
          if (texts.length === 1) {
            document.getElementById("chat-input").value = text
          }
        })
      }
    }

    // Armazenar imagens temporariamente
    setTimeout(() => {
      if (images.length > 0) {
        document.getElementById("chat-input").dataset.images = JSON.stringify(images)
      }
    }, 100)
  }

  // Função para alternar modelo
  function cycleModel() {
    STATE.currentModel = (STATE.currentModel + 1) % CONFIG.MODELS.length
    const model = CONFIG.MODELS[STATE.currentModel]
    document.getElementById("model-display").textContent = model.name
  }

  // Função para limpar chat
  function clearChat() {
    STATE.messages = []
    document.getElementById("chat-messages").innerHTML = ""
    document.getElementById("chat-input").value = ""
    document.getElementById("chat-input").placeholder = "Digite sua mensagem ou cole imagens..."
    delete document.getElementById("chat-input").dataset.images
  }

  // Função para criar interface
  function createUI() {
    const container = document.createElement("div")
    container.id = CHAT_ID
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
    `

    container.innerHTML = `
      <!-- Header -->
      <div style="padding: 15px; border-bottom: 1px solid #eee; background: #f8f9fa; border-radius: 10px 10px 0 0;">
        <div style="display: flex; justify-content: between; align-items: center;">
          <div>
            <div style="font-weight: bold; color: #333;">🤖 Chat IA</div>
            <div style="font-size: 12px; color: #666;">Cole imagens e texto</div>
          </div>
          <button onclick="document.getElementById('${CHAT_ID}').remove()" style="background: #dc3545; color: white; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-size: 12px; margin-left: auto;">×</button>
        </div>
        <div style="margin-top: 8px; display: flex; gap: 10px; align-items: center;">
          <div style="font-size: 11px; color: #666;">Modelo:</div>
          <div id="model-display" style="font-size: 11px; font-weight: bold; color: #007bff; cursor: pointer;" onclick="cycleModel()">${CONFIG.MODELS[0].name}</div>
          <button onclick="clearChat()" style="background: #6c757d; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; margin-left: auto;">Limpar</button>
        </div>
      </div>

      <!-- Messages -->
      <div id="chat-messages" style="flex: 1; padding: 15px; overflow-y: auto; background: #fff;">
        <div style="text-align: center; color: #666; font-size: 12px; margin: 20px 0;">
          Cole imagens (Ctrl+V) ou digite sua pergunta
        </div>
      </div>

      <!-- Input -->
      <div style="padding: 15px; border-top: 1px solid #eee; background: #f8f9fa;">
        <div style="display: flex; gap: 8px;">
          <input 
            id="chat-input" 
            type="text" 
            placeholder="Digite sua mensagem ou cole imagens..."
            style="flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 20px; outline: none; font-size: 14px;"
          />
          <button 
            id="send-btn"
            style="background: #007bff; color: white; border: none; border-radius: 50%; width: 35px; height: 35px; cursor: pointer; display: flex; align-items: center; justify-content: center;"
          >
            ➤
          </button>
        </div>
        <div style="font-size: 10px; color: #666; margin-top: 5px; text-align: center;">
          Ctrl+V para colar • Clique no modelo para trocar
        </div>
      </div>
    `

    document.body.appendChild(container)

    // Event listeners
    const input = document.getElementById("chat-input")
    const sendBtn = document.getElementById("send-btn")

    // Enviar mensagem
    const sendCurrentMessage = () => {
      const text = input.value.trim()
      if (!text) return

      const images = input.dataset.images ? JSON.parse(input.dataset.images) : []
      sendMessage(text, images)

      input.value = ""
      input.placeholder = "Digite sua mensagem ou cole imagens..."
      delete input.dataset.images
    }

    sendBtn.onclick = sendCurrentMessage
    input.onkeypress = (e) => {
      if (e.key === "Enter") {
        sendCurrentMessage()
      }
    }

    // Paste handler
    input.addEventListener("paste", handlePaste)

    // Funções globais para os botões
    window.cycleModel = cycleModel
    window.clearChat = clearChat

    // Adicionar CSS para animações
    const style = document.createElement("style")
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
    `
    document.head.appendChild(style)

    console.log("🤖 Chat IA ativado!")
    console.log("📋 Funcionalidades:")
    console.log("  • Cole imagens com Ctrl+V")
    console.log("  • Digite perguntas")
    console.log("  • Clique no modelo para trocar")
    console.log("  • Botão limpar para resetar")
  }

  // Inicializar
  createUI()
})()
