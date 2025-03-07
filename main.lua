    debugX = false

-- Carregar Rayfield
local Rayfield = loadstring(game:HttpGet('https://sirius.menu/rayfield'))()

-- Criar a Janela Principal
local Window = Rayfield:CreateWindow({
   Name = "Demonology Spy Solutions LLC",
   Icon = 0, 
   LoadingTitle = "Hacking evidences and files...",
   LoadingSubtitle = "by Demonology Spy",
   Theme = "Default",
   DisableRayfieldPrompts = false,
   DisableBuildWarnings = false,
   ConfigurationSaving = {
      Enabled = false
   }
})


-- Criar aba para status do fantamsa
local GhostTab = Window:CreateTab("Ghost", 4483362458) 
local GhostStatsSection = GhostTab:CreateSection("Ghost Status")
local SpeedLabel = GhostTab:CreateLabel("Velocidade: ??")
local FootstepsLabel = GhostTab:CreateLabel("GhostFootsteps: ??")
local GhostOrbLabel = GhostTab:CreateLabel("GhostOrb: ??")

-- Criar aba para informações do fantasma
local GhostTab = Window:CreateTab("Informations", 4483362458) 
local GhostSection = GhostTab:CreateSection("Rooms")
local GhostLocationLabel = GhostTab:CreateLabel("Ghost Location: ??")
local GhostFavoriteLabel = GhostTab:CreateLabel("Ghost Favorite Room: ??")
local ColdestRoomLabel = GhostTab:CreateLabel("Coldest Room: ?? (??°C)")
local GhostVelaLabel = GhostTab:CreateLabel("Spirit Candle: Inexistent")

-- Criar aba para informações do jogador
local PlayerTab = Window:CreateTab("Player", 4483362458)
local PlayerSection = PlayerTab:CreateSection("Employer Status")

local Player = game.Players.LocalPlayer
local SanityLabel = PlayerTab:CreateLabel("Sanity: ??")
local SpeedInput = PlayerTab:CreateInput({
   Name = "Change Speed",
   PlaceholderText = "Input Speed...",
   RemoveTextAfterFocusLost = false,
   Callback = function(Value)
       local Character = game.Workspace:FindFirstChild(Player.Name)
       if Character then
           local Humanoid = Character:FindFirstChild("Humanoid")
           if Humanoid then
               Humanoid.WalkSpeed = tonumber(Value) or 16
           end
       end
   end
})

-- Criar aba de Exploit
local ExploitTab = Window:CreateTab("Exploit", 4483362458)
local ExploitSection = ExploitTab:CreateSection("Hacks")

local ghostAlwaysVisible = false
local ghostESP = false
local isNoClipEnabled = false -- Variável para controlar o estado do NoClip

-- Toggle: Fantasma sempre visível
local AlwaysVisibleToggle = ExploitTab:CreateToggle({
    Name = "Fantasma Sempre Visível",
    CurrentValue = false,
    Callback = function(state)
        ghostAlwaysVisible = state
        local ghost = game.Workspace:FindFirstChild("Ghost")
        if ghost then
            local ghostModel = ghost:FindFirstChild("Model") or ghost
            if ghostModel then
                -- Alterar transparência de partes específicas do fantasma
                for _, v in pairs(ghostModel:GetDescendants()) do
                    if v:IsA("BasePart") then
                        -- Ajusta a transparência de partes específicas
                        v.Transparency = ghostAlwaysVisible and 0 or 1
                    end
                end
            end
        end
    end
})

-- Toggle: ESP do Fantasma
local ESPToggle = ExploitTab:CreateToggle({
    Name = "ESP Fantasma",
    CurrentValue = false,
    Callback = function(state)
        ghostESP = state
        local ghost = game.Workspace:FindFirstChild("Ghost")
        if ghost then
            local highlight = ghost:FindFirstChild("Highlight")
            if ghostESP then
                if not highlight then
                    highlight = Instance.new("Highlight")
                    highlight.Parent = ghost
                end
                highlight.FillColor = Color3.new(1, 0, 0)
                highlight.OutlineColor = Color3.new(1, 1, 1)
                highlight.FillTransparency = 0.5
                highlight.OutlineTransparency = 0
            else
                if highlight then
                    highlight:Destroy()
                end
            end
        end
    end
})

-- Função para controlar o NoClip sem afetar o movimento do personagem
local function onRenderStepped()
    local character = game.Workspace:FindFirstChild(Player.Name)
    if character then
        local humanoid = character:FindFirstChild("Humanoid")
        if humanoid then
            -- Se o NoClip estiver ativado, desativa a colisão de todas as partes do personagem
            if isNoClipEnabled then
                -- Desativa colisão de todas as partes
                for _, part in pairs(character:GetDescendants()) do
                    if part:IsA("BasePart") then
                        part.CanCollide = false
                    end
                end
            else
                -- Restaura a colisão de todas as partes do personagem
                for _, part in pairs(character:GetDescendants()) do
                    if part:IsA("BasePart") then
                        part.CanCollide = true
                    end
                end
            end
        end
    end
end

-- Conectar RenderStepped apenas quando o NoClip estiver ativado
local renderConnection = nil

local function toggleNoClip(state)
    isNoClipEnabled = state

    -- Se NoClip estiver ativado, conecta o RenderStepped
    if isNoClipEnabled then
        if not renderConnection then
            renderConnection = game:GetService("RunService").RenderStepped:Connect(onRenderStepped)
        end
    else
        -- Se NoClip estiver desativado, desconecta o RenderStepped
        if renderConnection then
            renderConnection:Disconnect()
            renderConnection = nil
        end
    end
end

-- Exemplo de função para alternar o estado do NoClip
local NoClipToggle = ExploitTab:CreateToggle({
    Name = "NoClip",
    CurrentValue = false,
    Callback = function(state)
        toggleNoClip(state)  -- Chama a função toggleNoClip para ativar ou desativar o NoClip
    end
})

-- Variáveis para notificações únicas
local notifiedPhantom = false
local notifiedUmbra = false
local notifiedOni = false
local lastSpeed = nil
local lastHuntState = false

-- Função para mostrar notificações
local function notify(message)
    Rayfield:Notify({
        Title = "Ghost Info",
        Content = message,
        Duration = 5,
        Image = 0,
        Actions = {
            Ignore = {
                Name = "OK",
                Callback = function() end
            }
        }
    })
end

-- Função para arredondar números para 2 casas decimais
local function round(num)
    return math.floor(num * 100 + 0.5) / 100
end

-- Função para verificar velas azuis
local function checkBlueCandles()
    local foundBlueCandle = false
    for _, descendant in pairs(game.Workspace:GetDescendants()) do
        if descendant:IsA("PointLight") then
            local color = descendant.Color
            if (color == Color3.fromRGB(107, 139, 255) or color == Color3.fromRGB(106, 150, 204) or color == Color3.fromRGB(75, 99, 255)) then
                foundBlueCandle = true
                break
            end
        end
    end
    return foundBlueCandle
end

-- Atualizar os valores a cada frame
game:GetService("RunService").RenderStepped:Connect(function()
    local ghost = game.Workspace:FindFirstChild("Ghost")

    if ghost then
        -- Atualizar localização do fantasma
        GhostLocationLabel:Set("Ghost Location: " .. (ghost:GetAttribute("CurrentRoom") or "??"))
        GhostFavoriteLabel:Set("Ghost Favorite Room: " .. (ghost:GetAttribute("FavoriteRoom") or "??"))

        -- Atualizar velocidade do fantasma
        local ghostHumanoid = ghost:FindFirstChild("Humanoid")
        if ghostHumanoid then
            local speed = round(ghostHumanoid.WalkSpeed)
            SpeedLabel:Set("Velocidade: " .. speed)

            -- Notificação do Phantom
            if speed == 12.2 and not notifiedPhantom then
                notify("Ghost: Phantom")
                notifiedPhantom = true
            end

            -- Notificação do Oni (mudança de 10.2 para 13)
            if lastSpeed == 10.2 and speed == 13 and not notifiedOni then
                notify("Ghost: Oni")
                notifiedOni = true
            end

            lastSpeed = speed
        else
            SpeedLabel:Set("Velocidade: ??")
        end

        -- Atualizar GhostFootsteps e GhostOrb
        local ghostFootsteps = ghost:FindFirstChild("GhostFootsteps") ~= nil
        FootstepsLabel:Set("GhostFootsteps: " .. (ghostFootsteps and "SIM" or "NÃO"))

        -- Notificação do Umbra
        if not ghostFootsteps and not notifiedUmbra then
            notify("Ghost: Umbra")
            notifiedUmbra = true
        end

        local ghostOrb = game.Workspace:FindFirstChild("GhostOrb")
        GhostOrbLabel:Set("GhostOrb: " .. (ghostOrb and "SIM" or "NÃO"))

        -- Notificação de Hunting
        local isHunting = ghost:GetAttribute("Hunting")
        if isHunting and not lastHuntState then
            notify("Ghost Hunting")
        end
        lastHuntState = isHunting
    end

    -- Atualizar Sanidade do Jogador
    SanityLabel:Set("Sanidade: " .. (Player:GetAttribute("Energy") and tostring(round(Player:GetAttribute("Energy"))) or "??"))

    -- Encontrar a sala mais fria
    local roomsFolder = game.Workspace:FindFirstChild("Map") and game.Workspace.Map:FindFirstChild("Rooms")
    if roomsFolder then
        local coldestRoom, lowestTemp = nil, math.huge
        for _, room in pairs(roomsFolder:GetChildren()) do
            if room:IsA("Folder") then
                local temp = room:GetAttribute("Temperature")
                if temp and type(temp) == "number" and temp < lowestTemp then
                    lowestTemp = temp
                    coldestRoom = room.Name
                end
            end
        end
        ColdestRoomLabel:Set("Coldest Room: " .. (coldestRoom or "??") .. " (" .. (coldestRoom and round(lowestTemp) or "??") .. "°C)")
    end

    -- Verificar se existe uma vela azul
    if checkBlueCandles() then
        GhostVelaLabel:Set("Vela Azul: Detectada")
    end
end)

-- Monitorar novos PointLights que surgem no Workspace
game.Workspace.DescendantAdded:Connect(function(descendant)
    if descendant:IsA("PointLight") then
        local color = descendant.Color
        if (color == Color3.fromRGB(107, 139, 255) or color == Color3.fromRGB(106, 150, 204) or color == Color3.fromRGB(75, 99, 255)) then
            GhostVelaLabel:Set("Vela Azul: Detectada")
        end
    end
end)
