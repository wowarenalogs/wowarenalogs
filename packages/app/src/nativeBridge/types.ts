export type ModuleApi = {
  moduleName: string;
  /**
   * A list of names that will be callable and map to ipcRenderer.invoke(...)
   */
  invoke?: string[];
  /**
   * A list of names that will generate listener registry functions and accept callbacks
   * through ipcRenderer.on(<name>, ...callback)
   */
  on?: string[];
  /**
   * Same as .on but registers for ipcRenderer.once
   */
  once?: string[];
  /**
   * A list of names that will register listener removers and maps to
   * ipcRenderer.removeAllListeners(<name>)
   * The api on the bridge will be:
   * removeAll_<name>_listeners: () => void
   */
  removeAll?: string[];
};
