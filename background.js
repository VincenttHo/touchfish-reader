// TouchFish Reader - 后台脚本
class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    this.setupCommandListeners();
    this.setupInstallListener();
  }

  // 设置快捷键监听
  setupCommandListeners() {
    chrome.commands.onCommand.addListener((command) => {
      this.handleCommand(command);
    });
  }

  // 设置安装监听
  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('TouchFish Reader 已安装');
        this.showWelcomeNotification();
      } else if (details.reason === 'update') {
        console.log('TouchFish Reader 已更新');
      }
    });
  }

  // 处理快捷键命令
  async handleCommand(command) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) return;

      // 发送命令到内容脚本
      let action;
      switch (command) {
        case 'next-page':
          action = 'nextPage';
          break;
        case 'prev-page':
          action = 'prevPage';
          break;
        default:
          return;
      }

      // 尝试发送消息到内容脚本
      try {
        await chrome.tabs.sendMessage(tab.id, { action });
      } catch (error) {
        // 如果内容脚本未加载，可能需要注入
        console.log('内容脚本未响应，可能需要刷新页面');
      }
    } catch (error) {
      console.log('处理快捷键失败:', error);
    }
  }

  // 显示欢迎通知
  showWelcomeNotification() {
    // 由于Chrome扩展的通知权限限制，这里只是记录日志
    console.log('欢迎使用 TouchFish Reader！');
    console.log('使用说明：');
    console.log('1. 点击插件图标导入txt格式的电子书');
    console.log('2. 激活插件后选择网页中的文本');
    console.log('3. 使用 Ctrl+← / Ctrl+→ 快捷键翻页');
    console.log('4. 右上角有隐秘的翻页按钮');
  }

  // 清理存储数据（可用于重置功能）
  async clearStorageData() {
    try {
      await chrome.storage.local.clear();
      console.log('存储数据已清理');
    } catch (error) {
      console.log('清理存储数据失败:', error);
    }
  }

  // 获取存储使用情况
  async getStorageUsage() {
    try {
      const data = await chrome.storage.local.get(null);
      const usage = JSON.stringify(data).length;
      console.log(`存储使用量: ${usage} 字节`);
      return usage;
    } catch (error) {
      console.log('获取存储使用量失败:', error);
      return 0;
    }
  }
}

// 初始化后台服务
const backgroundService = new BackgroundService();

// 扩展消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStorageUsage') {
    backgroundService.getStorageUsage().then(usage => {
      sendResponse({ usage });
    });
    return true; // 保持消息通道开放
  } else if (request.action === 'clearStorage') {
    backgroundService.clearStorageData().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// 标签页更新监听（用于处理页面刷新等情况）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 页面加载完成，可以在这里做一些初始化工作
    // 例如检查是否需要恢复阅读状态
  }
});

// 处理扩展图标点击（如果需要的话）
chrome.action.onClicked.addListener((tab) => {
  // 这里可以添加点击扩展图标时的行为
  // 目前使用popup，所以这个监听器不会被触发
});