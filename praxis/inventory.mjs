import { join } from 'node:path';
export function projectInventory({id,config,working,workspaceId,storage,reminderSpaces,slidesSpaces,polaris,financeMounts,financeProjectName,intelligenceRuntime,locations,add,file,source,safePath,paths,object}) {
file('行程记录', 'directory', config.dataDir);
    if (!working) {
      source('静态照片', 'public', '源码静态资源，不替代当前受控行程目录。');
      source('初始路线与历史基线', 'data');
      add({ label: '旧冰岛清单状态', kind: 'browser', storageKey: 'iceland-check-*', description: '仅适用于曾使用旧页面的浏览器；并非当前行程主存储。' });
    }
}
