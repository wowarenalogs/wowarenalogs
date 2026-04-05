import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
import path from 'path';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

interface AppSettings {
  anthropicApiKey?: string;
}

@nativeBridgeModule('settings')
export class SettingsModule extends NativeBridgeModule {
  private get settingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  private readSettings(): AppSettings {
    try {
      if (existsSync(this.settingsPath)) {
        return JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as AppSettings;
      }
    } catch {
      // ignore parse errors
    }
    return {};
  }

  private writeSettings(settings: AppSettings): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  @moduleFunction()
  public async getAnthropicApiKey(_mainWindow: Electron.BrowserWindow): Promise<string | null> {
    return this.readSettings().anthropicApiKey ?? null;
  }

  @moduleFunction()
  public async setAnthropicApiKey(_mainWindow: Electron.BrowserWindow, key: string): Promise<void> {
    const settings = this.readSettings();
    settings.anthropicApiKey = key;
    this.writeSettings(settings);
  }
}
