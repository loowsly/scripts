javascript: (() => {
  const CHAT_ID = "hck-interactive-chat-v1"
  if (document.getElementById(CHAT_ID)) {
    console.warn("Chat já está ativo!")
    return
  }

  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (isMobile()) {
    alert("CHAT INTERATIVO\n\nEste script não tem suporte para dispositivos móveis.")
    return
  }

  const SCRIPT_VERSION = "1.0.0-interactive"
  const CONFIG = {
    API_ENDPOINT: "https://v0-aiml-api-setup.vercel.app/api/chat-multi",
    MODELS: [
      { id: "gpt-4o-mini", name: "GPT-4O Mini (Rápido/Visão)", hasVision: true, color: "#00D0FF" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 (Geral/Visão)", hasVision: true, color: "#A070FF" },
      { id: "gpt-4o", name: "GPT-4O (Avançado/Visão)", hasVision: true, color: "#F50057" },
      { id: "deepseek-chat", name: "DeepSeek V3 (Rápido)", hasVision: false, color: "#FFDB41" },
      { id: "deepseek-reasoner", name: "DeepSeek R1 (Exatas)", hasVision: false, color: "#FF6B35" },
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        name: "Llama 3.3 (Humanas)",
        hasVision: false,
        color: "#4CAF50",
      },
    ],
    API_TIMEOUT: 45000,
  }

  const STATE = {
    isVisible: false,
    currentModelIndex: 0,
    isLoading: false,
    messages: [],
    images: [],
    ui: {},
  }

  const log = (level, ...args) => (console[level.toLowerCase()] || console.log)(`[CHAT]`, ...args)

  // Utility functions
  const withTimeout = (promise, ms) =>
    Promise.race([promise, new Promise((_, rj) => setTimeout(() => rj(new Error(`Timeout ${ms}ms`)), ms))])

  // Image processing
  async function processImageFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")

          // Resize image to save tokens
          const maxWidth = 800
          const maxHeight = 600
          let { width, height } = img

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            width *= ratio
            height *= ratio
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          const base64 = canvas.toDataURL("image/jpeg", 0.8)
          resolve({
            id: Date.now() + Math.random(),
            data: base64,
            name: file.name,
            size: file.size,
          })
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  // API functions
  async function queryApi(text, modelId, images = []) {
    const payload = {
      messages: [{ role: "user", content: text }],
      modelId: modelId,
      images: images.length > 0 ? images.map((img) => img.data) : undefined,
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

  // Chat functions
  async function sendMessage() {
    const input = document.getElementById(`${CHAT_ID}-input`)
    const text = input.value.trim()

    if (!text && STATE.images.length === 0) return

    const currentModel = CONFIG.MODELS[STATE.currentModelIndex]

    // Add user message to chat
    STATE.messages.push({
      role: "user",
      content: text || "(Imagens anexadas)",
      images: [...STATE.images],
      timestamp: Date.now(),
    })

    // Clear input and images
    input.value = ""
    STATE.images = []

    STATE.ui.updateChat()
    STATE.ui.updateImagePreview()

    // Show loading
    STATE.isLoading = true
    const loadingId = Date.now()
    STATE.messages.push({
      role: "assistant",
      content: "Pensando...",
      loading: true,
      id: loadingId,
      timestamp: Date.now(),
    })
    STATE.ui.updateChat()

    try {
      const result = await withTimeout(queryApi(text, currentModel.id, STATE.images), CONFIG.API_TIMEOUT)

      // Remove loading message and add real response
      STATE.messages = STATE.messages.filter((m) => m.id !== loadingId)
      STATE.messages.push({
        role: "assistant",
        content: result.response,
        model: result.model,
        hasImages: result.hasImages,
        tokensUsed: result.details?.tokensUsed,
        timestamp: Date.now(),
      })
    } catch (error) {
      STATE.messages = STATE.messages.filter((m) => m.id !== loadingId)
      STATE.messages.push({
        role: "assistant",
        content: `❌ Erro: ${error.message}`,
        error: true,
        timestamp: Date.now(),
      })
    } finally {
      STATE.isLoading = false
      STATE.ui.updateChat()
    }
  }

  function clearChat() {
    STATE.messages = []
    STATE.images = []
    STATE.ui.updateChat()
    STATE.ui.updateImagePreview()
  }

  function cycleModel() {
    STATE.currentModelIndex = (STATE.currentModelIndex + 1) % CONFIG.MODELS.length
    STATE.ui.updateModelDisplay()
  }

  // Event handlers
  function handleKeyPress(e) {
    if (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
      if (e.target.id === `${CHAT_ID}-input` && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
      return
    }

    if (e.key === "1") {
      e.preventDefault()
      STATE.ui.toggleChat()
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const text = e.dataTransfer.getData("text/plain")

    // Handle text drop
    if (text && !files.length) {
      const input = document.getElementById(`${CHAT_ID}-input`)
      input.value = (input.value + " " + text).trim()
      input.focus()
      return
    }

    // Handle file drops
    files.forEach(async (file) => {
      if (file.type.startsWith("image/")) {
        if (STATE.images.length >= 4) {
          alert("Máximo de 4 imagens por vez!")
          return
        }

        const processedImage = await processImageFile(file)
        STATE.images.push(processedImage)
        STATE.ui.updateImagePreview()
      } else if (file.type === "text/plain") {
        const reader = new FileReader()
        reader.onload = (e) => {
          const input = document.getElementById(`${CHAT_ID}-input`)
          input.value = (input.value + " " + e.target.result).trim()
          input.focus()
        }
        reader.readAsText(file)
      }
    })
  }

  function removeImage(imageId) {
    STATE.images = STATE.images.filter((img) => img.id !== imageId)
    STATE.ui.updateImagePreview()
  }

  function kill() {
    document.removeEventListener("keydown", handleKeyPress, true)
    document.removeEventListener("dragover", handleDragOver, true)
    document.removeEventListener("drop", handleDrop, true)
    document.getElementById(CHAT_ID)?.remove()
  }

  // UI Setup
  function setupUI() {
    const C = {
      font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      bg: "rgba(15, 15, 23, 0.95)",
      bgLight: "rgba(30, 30, 40, 0.9)",
      text: "#E2E8F0",
      textMuted: "#94A3B8",
      primary: "#8B5CF6",
      success: "#10B981",
      error: "#EF4444",
      warning: "#F59E0B",
      border: "rgba(148, 163, 184, 0.2)",
      shadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
    }

    // Add styles
    const style = document.createElement("style")
    style.textContent = `
      @keyframes chat-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes chat-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .chat-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      .chat-scrollbar::-webkit-scrollbar-track {
        background: rgba(148, 163, 184, 0.1);
        border-radius: 3px;
      }
      .chat-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.3);
        border-radius: 3px;
      }
      .chat-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.5);
      }
    `
    document.head.appendChild(style)

    // Create main container
    const container = document.createElement("div")
    container.id = CHAT_ID
    container.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      z-index: 2147483647;
      font-family: ${C.font};
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `

    // Chat panel
    const chatPanel = document.createElement("div")
    chatPanel.style.cssText = `
      width: 100%;
      height: 100%;
      background: ${C.bg};
      backdrop-filter: blur(20px);
      border-left: 1px solid ${C.border};
      display: flex;
      flex-direction: column;
      box-shadow: ${C.shadow};
    `

    // Header
    const header = document.createElement("div")
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid ${C.border};
      background: ${C.bgLight};
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    `

    const title = document.createElement("div")
    title.innerHTML = `
      <div style="font-weight: 600; font-size: 16px; color: ${C.text};">
        🤖 Chat Interativo
      </div>
      <div style="font-size: 12px; color: ${C.textMuted};">
        v${SCRIPT_VERSION}
      </div>
    `

    const closeBtn = document.createElement("button")
    closeBtn.innerHTML = "✕"
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${C.textMuted};
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: all 0.2s;
    `
    closeBtn.onmouseover = () => (closeBtn.style.color = C.error)
    closeBtn.onmouseout = () => (closeBtn.style.color = C.textMuted)
    closeBtn.onclick = () => STATE.ui.toggleChat()

    header.append(title, closeBtn)

    // Model selector
    const modelSelector = document.createElement("div")
    modelSelector.style.cssText = `
      padding: 12px 20px;
      border-bottom: 1px solid ${C.border};
      background: ${C.bgLight};
      flex-shrink: 0;
    `

    const modelDisplay = document.createElement("div")
    modelDisplay.id = `${CHAT_ID}-model`
    modelDisplay.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    `
    modelDisplay.onclick = cycleModel

    modelSelector.appendChild(modelDisplay)

    // Messages container
    const messagesContainer = document.createElement("div")
    messagesContainer.id = `${CHAT_ID}-messages`
    messagesContainer.className = "chat-scrollbar"
    messagesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `

    // Image preview
    const imagePreview = document.createElement("div")
    imagePreview.id = `${CHAT_ID}-images`
    imagePreview.style.cssText = `
      padding: 0 20px 12px;
      display: none;
      flex-wrap: wrap;
      gap: 8px;
      border-bottom: 1px solid ${C.border};
      flex-shrink: 0;
    `

    // Input container
    const inputContainer = document.createElement("div")
    inputContainer.style.cssText = `
      padding: 16px 20px;
      border-top: 1px solid ${C.border};
      background: ${C.bgLight};
      flex-shrink: 0;
    `

    const inputWrapper = document.createElement("div")
    inputWrapper.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: flex-end;
    `

    const input = document.createElement("textarea")
    input.id = `${CHAT_ID}-input`
    input.placeholder = "Digite sua mensagem ou arraste arquivos aqui..."
    input.style.cssText = `
      flex: 1;
      background: rgba(30, 30, 40, 0.8);
      border: 1px solid ${C.border};
      border-radius: 8px;
      padding: 12px;
      color: ${C.text};
      font-family: ${C.font};
      font-size: 14px;
      resize: none;
      min-height: 44px;
      max-height: 120px;
      outline: none;
      transition: border-color 0.2s;
    `
    input.onfocus = () => (input.style.borderColor = C.primary)
    input.onblur = () => (input.style.borderColor = C.border)

    const sendBtn = document.createElement("button")
    sendBtn.innerHTML = "📤"
    sendBtn.style.cssText = `
      background: ${C.primary};
      border: none;
      border-radius: 8px;
      width: 44px;
      height: 44px;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `
    sendBtn.onmouseover = () => (sendBtn.style.transform = "scale(1.05)")
    sendBtn.onmouseout = () => (sendBtn.style.transform = "scale(1)")
    sendBtn.onclick = sendMessage

    const clearBtn = document.createElement("button")
    clearBtn.innerHTML = "🗑️"
    clearBtn.style.cssText = `
      background: ${C.error};
      border: none;
      border-radius: 8px;
      width: 44px;
      height: 44px;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `
    clearBtn.onmouseover = () => (clearBtn.style.transform = "scale(1.05)")
    clearBtn.onmouseout = () => (clearBtn.style.transform = "scale(1)")
    clearBtn.onclick = clearChat

    inputWrapper.append(input, sendBtn, clearBtn)
    inputContainer.appendChild(inputWrapper)

    // Instructions
    const instructions = document.createElement("div")
    instructions.style.cssText = `
      padding: 12px 20px;
      background: rgba(139, 92, 246, 0.05);
      border-top: 1px solid ${C.border};
      font-size: 12px;
      color: ${C.textMuted};
      text-align: center;
      flex-shrink: 0;
    `
    instructions.innerHTML = `
      <div>📋 Arraste imagens e textos • Enter para enviar • [1] para mostrar/ocultar</div>
      <div style="margin-top: 4px;">🔄 Clique no modelo para alternar • 🗑️ para limpar chat</div>
    `

    // Assemble chat panel
    chatPanel.append(header, modelSelector, imagePreview, messagesContainer, inputContainer, instructions)
    container.appendChild(chatPanel)
    document.body.appendChild(container)

    // UI functions
    const toggleChat = () => {
      STATE.isVisible = !STATE.isVisible
      if (STATE.isVisible) {
        container.style.transform = "translateX(0)"
        setTimeout(() => document.getElementById(`${CHAT_ID}-input`)?.focus(), 300)
      } else {
        container.style.transform = "translateX(100%)"
      }
    }

    const updateModelDisplay = () => {
      const model = CONFIG.MODELS[STATE.currentModelIndex]
      const display = document.getElementById(`${CHAT_ID}-model`)
      if (display) {
        display.innerHTML = `
          <div>
            <div style="font-weight: 500; color: ${C.text}; font-size: 14px;">
              ${model.hasVision ? "👁️" : "💬"} ${model.name}
            </div>
            <div style="font-size: 11px; color: ${C.textMuted};">
              Clique para alternar modelo
            </div>
          </div>
          <div style="width: 12px; height: 12px; background: ${model.color}; border-radius: 50%; opacity: 0.8;"></div>
        `
      }
    }

    const updateImagePreview = () => {
      const preview = document.getElementById(`${CHAT_ID}-images`)
      if (!preview) return

      if (STATE.images.length === 0) {
        preview.style.display = "none"
        return
      }

      preview.style.display = "flex"
      preview.innerHTML = STATE.images
        .map(
          (img) => `
        <div style="position: relative; display: inline-block;">
          <img src="${img.data}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid ${C.border};" />
          <button onclick="removeImage('${img.id}')" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: ${C.error}; color: white; border: none; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
      `,
        )
        .join("")

      // Make removeImage globally accessible
      window.removeImage = removeImage
    }

    const updateChat = () => {
      const container = document.getElementById(`${CHAT_ID}-messages`)
      if (!container) return

      container.innerHTML = STATE.messages
        .map((msg) => {
          const isUser = msg.role === "user"
          const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

          return `
          <div style="display: flex; ${isUser ? "justify-content: flex-end" : "justify-content: flex-start"};">
            <div style="
              max-width: 80%;
              padding: 12px 16px;
              border-radius: 16px;
              background: ${isUser ? C.primary : msg.error ? C.error : C.bgLight};
              color: ${C.text};
              font-size: 14px;
              line-height: 1.4;
              ${msg.loading ? "animation: pulse 1.5s infinite;" : ""}
            ">
              ${
                msg.images && msg.images.length > 0
                  ? `
                <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
                  ${msg.images
                    .map(
                      (img) => `
                    <img src="${img.data}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; opacity: 0.8;" />
                  `,
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
              <div>${msg.content}</div>
              <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
                ${time}${msg.model ? ` • ${msg.model.split("/").pop()}` : ""}${msg.tokensUsed ? ` • ${msg.tokensUsed} tokens` : ""}
              </div>
            </div>
          </div>
        `
        })
        .join("")

      // Scroll to bottom
      container.scrollTop = container.scrollHeight
    }

    return {
      toggleChat,
      updateModelDisplay,
      updateImagePreview,
      updateChat,
    }
  }

  // Initialize
  try {
    STATE.ui = setupUI()

    // Event listeners
    document.addEventListener("keydown", handleKeyPress, true)
    document.addEventListener("dragover", handleDragOver, true)
    document.addEventListener("drop", handleDrop, true)

    // Initial setup
    STATE.ui.updateModelDisplay()

    log("INFO", `Chat Interativo v${SCRIPT_VERSION} ativado! Pressione [1] para abrir.`)

    // Show welcome message
    setTimeout(() => {
      const notification = document.createElement("div")
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(139, 92, 246, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: Inter, sans-serif;
        font-size: 14px;
        z-index: 2147483646;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        animation: chat-slide-in 0.3s ease-out;
      `
      notification.innerHTML = `
        <div style="font-weight: 600;">🤖 Chat Interativo Ativado!</div>
        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Pressione [1] para abrir o chat</div>
      `
      document.body.appendChild(notification)

      setTimeout(() => {
        notification.style.animation = "chat-slide-out 0.3s ease-out"
        setTimeout(() => notification.remove(), 300)
      }, 3000)
    }, 500)
  } catch (error) {
    console.error("Erro ao inicializar chat:", error)
  }
})()
