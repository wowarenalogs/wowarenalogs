/* eslint-disable no-console */
import ElectronStore from 'electron-store';
import path from 'path';
import { EventEmitter } from 'stream';

import { configSchema, ConfigurationChangeCallback, ConfigurationSchema } from './configSchema';

export default class ConfigService extends EventEmitter {
  /**
   * Singleton instance of class.
   */
  private static _instance: ConfigService;

  private _store = new ElectronStore<ConfigurationSchema>({
    schema: configSchema,
    name: 'config-v3',
  });

  private unSubscribe: ReturnType<typeof this._store.onDidAnyChange> | null = null;

  /**
   * Get the instance of the class as a singleton.
   * There should only ever be one instance created and this method facilitates that.
   */
  static getInstance(): ConfigService {
    if (!ConfigService._instance) {
      ConfigService._instance = new ConfigService();
    }

    return ConfigService._instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setValue(key: keyof ConfigurationSchema, value: any) {
    if (!this.configValueChanged(key, value)) {
      return;
    }
    this.set(key, value);
    // this.emit('change', key, value);
    ConfigService.logConfigChanged({ [key]: value });
  }

  public setValues(values: Partial<ConfigurationSchema>) {
    const configKeys = Object.keys(values) as (keyof ConfigurationSchema)[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newConfigValues: Record<string, any> = {};

    configKeys.forEach((key) => {
      if (!this.configValueChanged(key, values[key])) {
        return;
      }

      newConfigValues[key] = values[key];

      this.set(key, values[key]);
      // this.emit('change', key, values[key]);
    });

    ConfigService.logConfigChanged(values);
  }

  private constructor() {
    super();

    this.cleanupStore();

    console.log('[Config Service] Using configuration', this._store.store);

    // this._store.onDidAnyChange((newValue: any, oldValue: any) => {
    //   this.emit('configChanged', oldValue, newValue);
    // });
  }

  public getStore() {
    return this._store.store;
  }

  /**
   * Subscribe to conifugration updates, only a single subscriber is allowed
   */
  public subscribeToConfigurationUpdates(callback: ConfigurationChangeCallback) {
    if (this.unSubscribe) this.unSubscribe();
    this.unSubscribe = this._store.onDidAnyChange((newVal, oldVal) => {
      callback(newVal, oldVal);
    });
  }

  public get<T>(key: keyof ConfigurationSchema): T {
    if (!configSchema[key]) {
      throw Error(`[Config Service] Attempted to get invalid configuration key '${key}'`);
    }

    const value = this._store.get(key);

    if (!this._store.has(key) || value === '' || value === null || value === undefined) {
      if (configSchema[key] && configSchema[key].default !== undefined) {
        return configSchema[key].default as T;
      }
    }

    return value as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private set(key: keyof ConfigurationSchema, value: any): void {
    if (!configSchema[key]) {
      throw Error(`[Config Service] Attempted to set invalid configuration key '${key}'`);
    }

    if (value === null || value === undefined || value === '') {
      this._store.delete(key);
      return;
    }

    this._store.set(key, value);
  }

  getPath(key: keyof ConfigurationSchema): string {
    const value = this.get<string>(key);

    if (!value) {
      return '';
    }

    return path.join(value, path.sep);
  }

  /**
   * Ensure that only keys specified in the `configSchema` exists in the store
   * and delete any that are no longer relevant. This is necessary to keep the
   * config store up to date when config keys occasionally change/become obsolete.
   */
  private cleanupStore(): void {
    const configSchemaKeys = Object.keys(configSchema);
    const keysToDelete = Object.keys(this._store.store).filter((k) => !configSchemaKeys.includes(k));

    if (!keysToDelete.length) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore complains about 'string' not being assignable to
    // keyof ConfigurationSchema, which is true but also moot since we're
    // trying to remove keys that _don't_ exist in the schema.
    keysToDelete.forEach((k) => this._store.delete(k));

    console.log('[Config Service] Deleted deprecated keys from configuration store', keysToDelete);
  }

  /**
   * Determine whether a configuration value has changed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private configValueChanged(key: string, value: any): boolean {
    // We're checking for null here because we don't allow storing
    // null values and as such if we get one, it's because it's empty/shouldn't
    // be saved.
    return value !== null && this._store.get(key) !== value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static logConfigChanged(newConfig: { [key: string]: any }): void {
    console.log('[Config Service] Configuration changed:', newConfig);
  }
}
