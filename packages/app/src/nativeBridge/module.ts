/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { BrowserWindow } from 'electron';

type ModuleFunction = {
  name: string;
  value: (mainWindow: BrowserWindow, ...args: any[]) => Promise<any>;
  isOptional: boolean;
};

type ModuleEventType = 'on' | 'once';

type ModuleEvent = {
  name: string;
  type: ModuleEventType;
  /**
   * This flag determines the optionality of the type created
   *
   * If you are writing a new native module then previous app builds will not have this function - this means that your
   * f/e should assume the function is optional and test for it being present before attempting to call it (which
   * would be an exception).
   *
   * Generally speaking this field can be left empty and is only used to correct the typing on functions that were
   * present in the original builds of the application.
   *
   * Default: true
   */
  isOptional: boolean;
};

type NativeBridgeModuleMetadata = {
  name: string;
  constructor: Function;
  functions: Record<string, ModuleFunction>;
  events: Record<string, ModuleEvent>;
};

export const MODULE_METADATA: Map<Function, NativeBridgeModuleMetadata> = new Map<
  Function,
  NativeBridgeModuleMetadata
>();

function ensureModuleMetadata(ctor: Function): NativeBridgeModuleMetadata {
  if (!MODULE_METADATA.has(ctor)) {
    MODULE_METADATA.set(ctor, {
      name: ctor.name,
      constructor: ctor,
      functions: {},
      events: {},
    });
  }

  const result = MODULE_METADATA.get(ctor);
  if (result) {
    return result;
  }
  throw new Error('Failed to ensure module metadata');
}

export function nativeBridgeModule(name: string) {
  return function (ctor: new () => NativeBridgeModule) {
    const module = ensureModuleMetadata(ctor);
    module.name = name;
  };
}

export function getModuleKey(moduleName: string): string {
  return `wowarenalogs:${moduleName}`;
}

export function getModuleFunctionKey(moduleName: string, functionName: string): string {
  return `${getModuleKey(moduleName)}:${functionName}`;
}

export function getModuleEventKey(moduleName: string, eventName: string): string {
  return `${getModuleKey(moduleName)}:${eventName}`;
}

export function moduleFunction(options?: { isOptional: boolean } | undefined) {
  const actuallyOptional = options?.isOptional ?? true;
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    if (!target.constructor) {
      throw new Error('@moduleFunction must be used within a class');
    }

    const module = ensureModuleMetadata(target.constructor);
    module.functions[key] = {
      name: key,
      value: descriptor.value,
      isOptional: actuallyOptional,
    };
  };
}

export function moduleEvent(type: ModuleEventType, options?: { isOptional: boolean } | undefined) {
  const actuallyOptional = options?.isOptional ?? true;
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    if (!target.constructor) {
      throw new Error('@moduleEvent must be used within a class');
    }

    const module = ensureModuleMetadata(target.constructor);
    module.events[key] = {
      type,
      name: key,
      isOptional: actuallyOptional,
    };

    descriptor.value = (mainWindow: BrowserWindow, ...args: any[]) => {
      const eventKey = `${getModuleKey(module.name)}:${key}`;
      mainWindow.webContents.send(eventKey, ...args);
    };
  };
}

export abstract class NativeBridgeModule {
  /**
   * Callback after module is registered in case any bespoke action is needed.
   * Useful for mapping events on the mainWindow into module domain events.
   * @param _mainWindow BrowserWindow
   */
  public onRegistered(_mainWindow: BrowserWindow): void {
    return;
  }
}
