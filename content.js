// TouchFish Reader - 内容脚本
class TouchFishReader {
  constructor() {
    this.isActive = false;
    this.currentBook = null;
    this.currentPage = 0;
    this.selectedElement = null;
    this.originalContent = '';
    this.pageSize = 200; // 默认每页字数
    this.isSelectingMode = false; // 区域选择模式
    this.hoveredElement = null; // 当前悬停的元素
    this.highlightBox = null; // 高亮框元素
    this.init();
  }

  init() {
    this.loadState();
    this.setupEventListeners();
    this.createControlButtons();
  }

  // 加载保存的状态
  async loadState() {
    try {
      const result = await chrome.storage.local.get([
        'touchfishBooks', 'touchfishCurrentBookId', 'touchfishPage', 'touchfishActive',
        // 兼容旧版本数据
        'touchfishBook'
      ]);
      
      // 处理新版本数据结构
      if (result.touchfishBooks && result.touchfishCurrentBookId) {
        const currentBook = result.touchfishBooks[result.touchfishCurrentBookId];
        if (currentBook) {
          this.currentBook = currentBook.content;
          this.currentPage = currentBook.currentPage || 0;
        }
        this.isActive = result.touchfishActive || false;
      }
      // 兼容旧版本数据
      else if (result.touchfishBook) {
        this.currentBook = result.touchfishBook;
        this.currentPage = result.touchfishPage || 0;
        this.isActive = result.touchfishActive || false;
        
        // 迁移到新数据结构
        await this.migrateOldData(result.touchfishBook);
      }
    } catch (error) {
      console.log('加载状态失败:', error);
    }
  }

  // 迁移旧版本数据到新结构
  async migrateOldData(oldBook) {
    try {
      const bookId = 'book_' + Date.now();
      const bookData = {
        id: bookId,
        title: '导入的书籍',
        content: oldBook,
        currentPage: this.currentPage,
        totalPages: this.splitIntoPages(oldBook).length,
        importTime: new Date().toISOString()
      };
      
      const books = { [bookId]: bookData };
      
      await chrome.storage.local.set({
        touchfishBooks: books,
        touchfishCurrentBookId: bookId,
        touchfishActive: this.isActive
      });
      
      // 清理旧数据
      await chrome.storage.local.remove(['touchfishBook', 'touchfishPage']);
      
      console.log('数据迁移完成');
    } catch (error) {
      console.log('数据迁移失败:', error);
    }
  }

  // 保存状态
  async saveState() {
    try {
      const result = await chrome.storage.local.get(['touchfishBooks', 'touchfishCurrentBookId']);
      if (result.touchfishBooks && result.touchfishCurrentBookId) {
        const books = result.touchfishBooks;
        const currentBookId = result.touchfishCurrentBookId;
        
        if (books[currentBookId]) {
          books[currentBookId].currentPage = this.currentPage;
        }
        
        await chrome.storage.local.set({
          touchfishBooks: books,
          touchfishActive: this.isActive
        });
      }
    } catch (error) {
      console.log('保存状态失败:', error);
    }
  }

  // 设置事件监听器
  setupEventListeners() {
    // 监听文本选择（仅在非选择模式下）
    document.addEventListener('mouseup', (e) => {
      if (this.isActive && this.currentBook && !this.isSelectingMode) {
        this.handleTextSelection();
      }
    });

    // 监听区域选择模式的鼠标事件
    document.addEventListener('mouseover', (e) => {
      if (this.isSelectingMode) {
        this.handleElementHover(e);
      }
    });

    document.addEventListener('click', (e) => {
      if (this.isSelectingMode) {
        e.preventDefault();
        e.stopPropagation();
        this.selectElement(e.target);
      }
    });

    // 监听快捷键
    document.addEventListener('keydown', (e) => {
      if (this.isActive && this.selectedElement) {
        if (e.ctrlKey && e.key === 'ArrowRight') {
          e.preventDefault();
          this.nextPage();
        } else if (e.ctrlKey && e.key === 'ArrowLeft') {
          e.preventDefault();
          this.prevPage();
        }
      }
      
      // ESC键退出选择模式
      if (e.key === 'Escape' && this.isSelectingMode) {
        this.exitSelectingMode();
      }
    });

    // 监听来自popup和background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'ping') {
        // 响应连接检测
        sendResponse({pong: true});
      } else if (request.action === 'loadBook') {
        this.loadBook(request.bookContent, request.title).then(result => {
          sendResponse(result);
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else if (request.action === 'toggleActive') {
        this.toggleActive();
        sendResponse({active: this.isActive});
      } else if (request.action === 'getStatus') {
        sendResponse({
          active: this.isActive,
          hasBook: !!this.currentBook,
          currentPage: this.currentPage,
          totalPages: this.getTotalPages(),
          isSelectingMode: this.isSelectingMode
        });
      } else if (request.action === 'nextPage') {
        this.nextPage();
        sendResponse({success: true});
      } else if (request.action === 'prevPage') {
        this.prevPage();
        sendResponse({success: true});
      } else if (request.action === 'enterSelectingMode') {
        this.enterSelectingMode();
        sendResponse({success: true});
      } else if (request.action === 'exitSelectingMode') {
        this.exitSelectingMode();
        sendResponse({success: true});
      } else if (request.action === 'restoreOriginalContent') {
        this.restoreOriginalContent();
        sendResponse({success: true});
      } else if (request.action === 'getBookList') {
        chrome.storage.local.get(['touchfishBooks', 'touchfishCurrentBookId']).then(result => {
          const books = result.touchfishBooks || {};
          const currentBookId = result.touchfishCurrentBookId;
          sendResponse({ books, currentBookId });
        }).catch(error => {
          sendResponse({ books: {}, currentBookId: null, error: error.message });
        });
      } else if (request.action === 'switchBook') {
        chrome.storage.local.get(['touchfishBooks']).then(result => {
          const books = result.touchfishBooks || {};
          const targetBook = books[request.bookId];
          
          if (targetBook) {
            // 更新当前书籍
            chrome.storage.local.set({
              touchfishCurrentBookId: request.bookId
            }).then(() => {
              // 重新加载状态
              this.loadState().then(() => {
                sendResponse({ success: true });
              });
            });
          } else {
            sendResponse({ success: false, error: '书籍不存在' });
          }
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else if (request.action === 'deleteBook') {
        chrome.storage.local.get(['touchfishBooks', 'touchfishCurrentBookId']).then(result => {
          const books = result.touchfishBooks || {};
          const currentBookId = result.touchfishCurrentBookId;
          
          if (books[request.bookId]) {
            delete books[request.bookId];
            
            let newCurrentBookId = currentBookId;
            // 如果删除的是当前书籍，需要切换到其他书籍或清空
            if (currentBookId === request.bookId) {
              const remainingBooks = Object.keys(books);
              newCurrentBookId = remainingBooks.length > 0 ? remainingBooks[0] : null;
              
              if (newCurrentBookId) {
                this.currentBook = books[newCurrentBookId].content;
                this.currentPage = books[newCurrentBookId].currentPage;
                this.pages = this.splitIntoPages(books[newCurrentBookId].content);
              } else {
                this.currentBook = null;
                this.currentPage = 0;
                this.pages = [];
              }
            }
            
            chrome.storage.local.set({
              touchfishBooks: books,
              touchfishCurrentBookId: newCurrentBookId
            }).then(() => {
              sendResponse({ success: true, newCurrentBookId });
            });
          } else {
            sendResponse({ success: false, error: '书籍不存在' });
          }
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      }
      
      return true; // 保持消息通道开放
    });

  }

  // 创建隐秘的控制按钮
  createControlButtons() {
    // 创建一个几乎不可见的控制区域
    const controlDiv = document.createElement('div');
    controlDiv.id = 'touchfish-controls';
    controlDiv.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 20px;
      height: 60px;
      z-index: 999999;
      opacity: 0.1;
      transition: opacity 0.3s;
    `;

    // 鼠标悬停时显示
    controlDiv.addEventListener('mouseenter', () => {
      controlDiv.style.opacity = '0.8';
    });
    controlDiv.addEventListener('mouseleave', () => {
      controlDiv.style.opacity = '0.1';
    });

    // 上一页按钮
    const prevBtn = document.createElement('div');
    prevBtn.textContent = '◀';
    prevBtn.style.cssText = `
      width: 20px;
      height: 20px;
      background: #333;
      color: white;
      text-align: center;
      line-height: 20px;
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 2px;
    `;
    prevBtn.addEventListener('click', () => this.prevPage());

    // 下一页按钮
    const nextBtn = document.createElement('div');
    nextBtn.textContent = '▶';
    nextBtn.style.cssText = `
      width: 20px;
      height: 20px;
      background: #333;
      color: white;
      text-align: center;
      line-height: 20px;
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 2px;
    `;
    nextBtn.addEventListener('click', () => this.nextPage());

    // 状态指示器
    const statusDiv = document.createElement('div');
    statusDiv.id = 'touchfish-status';
    statusDiv.style.cssText = `
      width: 20px;
      height: 16px;
      background: ${this.isActive ? '#4CAF50' : '#f44336'};
      font-size: 8px;
      color: white;
      text-align: center;
      line-height: 16px;
    `;
    statusDiv.textContent = this.isActive ? 'ON' : 'OFF';

    controlDiv.appendChild(prevBtn);
    controlDiv.appendChild(nextBtn);
    controlDiv.appendChild(statusDiv);
    document.body.appendChild(controlDiv);

    this.controlDiv = controlDiv;
    this.statusDiv = statusDiv;
  }

  // 处理文本选择
  handleTextSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      if (selectedText.length > 10) { // 只处理较长的选择
        this.selectedElement = range.commonAncestorContainer;
        if (this.selectedElement.nodeType === Node.TEXT_NODE) {
          this.selectedElement = this.selectedElement.parentElement;
        }
        
        this.originalContent = this.selectedElement.textContent;
        this.pageSize = Math.max(selectedText.length, 100);
        this.replaceWithBookContent();
        selection.removeAllRanges();
      }
    }
  }

  // 替换为电子书内容
  replaceWithBookContent() {
    if (!this.selectedElement || !this.currentBook) return;

    const bookContent = this.getCurrentPageContent();
    this.selectedElement.textContent = bookContent;
    // 不修改样式，保持原有外观
    this.selectedElement.classList.add('touchfish-reading');
    this.saveState();
  }

  // 获取当前页内容
  getCurrentPageContent() {
    if (!this.currentBook) return '';
    
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.currentBook.slice(startIndex, endIndex);
  }

  // 下一页
  nextPage() {
    if (!this.currentBook || !this.selectedElement) return;
    
    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.replaceWithBookContent();
    }
  }

  // 上一页
  prevPage() {
    if (!this.currentBook || !this.selectedElement) return;
    
    if (this.currentPage > 0) {
      this.currentPage--;
      this.replaceWithBookContent();
    }
  }

  // 获取总页数
  getTotalPages() {
    if (!this.currentBook) return 0;
    return Math.ceil(this.currentBook.length / this.pageSize);
  }

  // 加载电子书
  async loadBook(bookContent, bookTitle = null) {
    try {
      const bookId = 'book_' + Date.now();
      const pages = this.splitIntoPages(bookContent);
      
      const bookData = {
        id: bookId,
        title: bookTitle || this.extractTitleFromContent(bookContent),
        content: bookContent,
        currentPage: 0,
        totalPages: pages.length,
        importTime: new Date().toISOString()
      };
      
      // 获取现有书籍列表
      const result = await chrome.storage.local.get(['touchfishBooks']);
      const books = result.touchfishBooks || {};
      
      // 添加新书籍
      books[bookId] = bookData;
      
      // 保存到存储
      await chrome.storage.local.set({
        touchfishBooks: books,
        touchfishCurrentBookId: bookId,
        touchfishActive: this.isActive
      });
      
      // 更新当前状态
      this.currentBook = bookContent;
      this.currentPage = 0;
      this.pages = pages;
      
      return {
        success: true,
        bookId: bookId,
        totalPages: pages.length,
        currentPage: 0
      };
    } catch (error) {
      console.log('加载书籍失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 从内容中提取标题
  extractTitleFromContent(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // 如果第一行不超过50个字符，可能是标题
      if (firstLine.length <= 50) {
        return firstLine;
      }
    }
    return '未命名书籍';
  }

  // 分页处理
  splitIntoPages(content) {
    const pages = [];
    for (let i = 0; i < content.length; i += this.pageSize) {
      pages.push(content.slice(i, i + this.pageSize));
    }
    return pages;
  }

  // 切换激活状态
  toggleActive() {
    this.isActive = !this.isActive;
    
    if (!this.isActive && this.selectedElement) {
      // 恢复原始内容
      this.selectedElement.textContent = this.originalContent;
      this.selectedElement.style.backgroundColor = '';
      this.selectedElement = null;
    }
    
    // 更新状态指示器
    if (this.statusDiv) {
      this.statusDiv.style.backgroundColor = this.isActive ? '#4CAF50' : '#f44336';
      this.statusDiv.textContent = this.isActive ? 'ON' : 'OFF';
    }
    
    this.saveState();
  }

  // 恢复原始内容
  restoreOriginalContent() {
    if (this.selectedElement && this.originalContent) {
      this.selectedElement.textContent = this.originalContent;
      this.selectedElement.classList.remove('touchfish-reading');
    }
  }

  // 进入区域选择模式
  enterSelectingMode() {
    this.isSelectingMode = true;
    this.createHighlightBox();
    document.body.style.cursor = 'crosshair';
    
    // 显示提示信息
    this.showSelectingModeHint();
  }

  // 退出区域选择模式
  exitSelectingMode() {
    this.isSelectingMode = false;
    document.body.style.cursor = '';
    
    if (this.highlightBox) {
      this.highlightBox.remove();
      this.highlightBox = null;
    }
    
    this.hideSelectingModeHint();
  }

  // 创建高亮框
  createHighlightBox() {
    this.highlightBox = document.createElement('div');
    this.highlightBox.id = 'touchfish-highlight-box';
    this.highlightBox.style.cssText = `
      position: absolute;
      border: 2px solid #007bff;
      background: rgba(0, 123, 255, 0.1);
      pointer-events: none;
      z-index: 999998;
      display: none;
      border-radius: 3px;
      box-shadow: 0 0 10px rgba(0, 123, 255, 0.3);
    `;
    document.body.appendChild(this.highlightBox);
  }

  // 处理元素悬停
  handleElementHover(event) {
    const element = event.target;
    
    // 跳过不适合的元素
    if (this.shouldSkipElement(element)) {
      this.hideHighlightBox();
      return;
    }
    
    this.hoveredElement = element;
    this.showHighlightBox(element);
  }

  // 判断是否应该跳过某个元素
  shouldSkipElement(element) {
    const tagName = element.tagName.toLowerCase();
    const skipTags = ['html', 'body', 'head', 'script', 'style', 'meta', 'link'];
    
    // 跳过特定标签
    if (skipTags.includes(tagName)) return true;
    
    // 跳过插件自己的元素
    if (element.id && element.id.startsWith('touchfish-')) return true;
    
    // 跳过没有文本内容的元素
    if (!element.textContent || element.textContent.trim().length < 10) return true;
    
    return false;
  }

  // 显示高亮框
  showHighlightBox(element) {
    if (!this.highlightBox) return;
    
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    this.highlightBox.style.cssText += `
      display: block;
      top: ${rect.top + scrollTop - 2}px;
      left: ${rect.left + scrollLeft - 2}px;
      width: ${rect.width + 4}px;
      height: ${rect.height + 4}px;
    `;
  }

  // 隐藏高亮框
  hideHighlightBox() {
    if (this.highlightBox) {
      this.highlightBox.style.display = 'none';
    }
  }

  // 选择元素
  selectElement(element) {
    if (this.shouldSkipElement(element)) {
      return;
    }
    
    // 保存选中的元素和原始内容
    this.selectedElement = element;
    this.originalContent = element.textContent;
    this.pageSize = Math.max(element.textContent.length, 100);
    
    // 退出选择模式
    this.exitSelectingMode();
    
    // 如果有电子书内容，立即替换
    if (this.currentBook) {
      this.replaceWithBookContent();
    }
  }

  // 显示选择模式提示
  showSelectingModeHint() {
    const hint = document.createElement('div');
    hint.id = 'touchfish-selecting-hint';
    hint.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #007bff;
      color: white;
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    hint.textContent = '🎯 选择要替换的区域 (ESC键退出)';
    document.body.appendChild(hint);
  }

  // 隐藏选择模式提示
  hideSelectingModeHint() {
    const hint = document.getElementById('touchfish-selecting-hint');
    if (hint) {
      hint.remove();
    }
  }
}

// 初始化
const touchFishReader = new TouchFishReader();

// 页面卸载时保存状态
window.addEventListener('beforeunload', () => {
  touchFishReader.saveState();
});