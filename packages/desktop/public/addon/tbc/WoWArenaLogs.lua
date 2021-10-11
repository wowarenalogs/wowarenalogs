local function OnEvent(self, event, ...)
  if(event == "ZONE_CHANGED_NEW_AREA") then
	  LoggingCombat(true)

		local type = select(2, IsInInstance())
		if (type == "arena") then
			print("|cffff8000WoW Arena Logs|r: Combat logging has been enabled. Good luck!")
		end
	end
end

local function OnInitialize()
  print("WoWArenaLogs Loaded. Your arena combats will be automatically logged.")
end

local loadFrame = CreateFrame("Frame")
loadFrame:RegisterEvent("PLAYER_LOGIN")
loadFrame:SetScript("OnEvent", OnInitialize)

local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("ZONE_CHANGED_NEW_AREA")
eventFrame:SetScript("OnEvent", OnEvent)