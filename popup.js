// TouchFish Reader - 弹出窗口脚本
class PopupController {
  constructor() {
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.updateStatus();
    await this.loadBookList();
  }

  setupEventListeners() {
    // 绑定事件监听器
    document.getElementById('toggle-btn').addEventListener('click', this.toggleActive.bind(this));
    document.getElementById('book-file').addEventListener('change', this.handleFileSelect.bind(this));
    document.getElementById('selectAreaBtn').addEventListener('click', this.enterSelectingMode.bind(this));
    document.getElementById('prev-page-btn').addEventListener('click', this.prevPage.bind(this));
    document.getElementById('next-page-btn').addEventListener('click', this.nextPage.bind(this));
    document.getElementById('restore-btn').addEventListener('click', this.restoreContent.bind(this));
  }

  // 更新状态显示
  async updateStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.updateUI({ active: false, hasBook: false, currentPage: 0, totalPages: 0 });
        return;
      }
      
      // 检查内容脚本是否已加载
      const isLoaded = await this.checkContentScriptLoaded(tab.id);
      
      if (!isLoaded) {
        console.log('内容脚本未加载，显示默认状态');
        this.updateUI({ active: false, hasBook: false, currentPage: 0, totalPages: 0 });
        return;
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getStatus'
      });

      if (response) {
        this.updateUI(response);
      } else {
        this.updateUI({ active: false, hasBook: false, currentPage: 0, totalPages: 0 });
      }
    } catch (error) {
      console.log('获取状态失败:', error);
      this.updateUI({ active: false, hasBook: false, currentPage: 0, totalPages: 0 });
    }
  }

  // 更新UI显示
  updateUI(status) {
    const statusDisplay = document.getElementById('status-display');
    const toggleBtn = document.getElementById('toggle-btn');
    const progressInfo = document.getElementById('progress-info');
    const currentPage = document.getElementById('current-page');
    const totalPages = document.getElementById('total-pages');
    const progressPercent = document.getElementById('progress-percent');
    const controlButtons = document.getElementById('control-buttons');

    // 更新状态文本和按钮
    if (status.active) {
      statusDisplay.textContent = '已激活';
      toggleBtn.textContent = '停用';
      toggleBtn.className = 'toggle-btn active';
      if (controlButtons) controlButtons.style.display = 'block';
    } else {
      statusDisplay.textContent = '未激活';
      toggleBtn.textContent = '激活';
      toggleBtn.className = 'toggle-btn inactive';
      if (controlButtons) controlButtons.style.display = 'none';
    }

    // 更新进度信息
    if (status.hasBook && status.totalPages > 0) {
      progressInfo.style.display = 'block';
      currentPage.textContent = status.currentPage + 1;
      totalPages.textContent = status.totalPages;
      
      const percent = Math.round((status.currentPage / status.totalPages) * 100);
      progressPercent.textContent = percent + '%';
    } else {
      progressInfo.style.display = 'none';
    }
  }

  // 进入选择模式
  async enterSelectingMode() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      await chrome.tabs.sendMessage(tab.id, {action: 'enterSelectingMode'});
      window.close(); // 关闭popup让用户在页面上选择
    } catch (error) {
      console.error('进入选择模式失败:', error);
      this.showMessage('进入选择模式失败，请确保页面已加载完成', 'error');
    }
  }

  // 上一页
  async prevPage() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      await chrome.tabs.sendMessage(tab.id, {action: 'prevPage'});
      await this.updateStatus();
    } catch (error) {
      console.error('翻页失败:', error);
    }
  }

  // 下一页
  async nextPage() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      await chrome.tabs.sendMessage(tab.id, {action: 'nextPage'});
      await this.updateStatus();
    } catch (error) {
      console.error('翻页失败:', error);
    }
  }

  // 恢复原文
  async restoreContent() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      await chrome.tabs.sendMessage(tab.id, {action: 'restoreOriginalContent'});
    } catch (error) {
      console.error('恢复原文失败:', error);
    }
  }

  // 切换激活状态
  async toggleActive() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.showMessage('无法获取当前标签页', 'error');
        return;
      }
      
      // 检查页面是否支持内容脚本
      if (!this.isPageSupported(tab.url)) {
        this.showMessage('当前页面类型不支持使用此扩展，请在普通网页中使用', 'error');
        return;
      }
      
      // 检查内容脚本是否已加载
      const isLoaded = await this.checkContentScriptLoaded(tab.id);
      
      if (!isLoaded) {
        console.log('内容脚本未加载，尝试注入...');
        const injected = await this.injectContentScript(tab.id);
        
        if (!injected) {
          this.showMessage('内容脚本未加载，请刷新页面后重试', 'error');
          return;
        }
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'toggleActive'
      });

      if (response) {
        await this.updateStatus();
      } else {
        this.showMessage('操作失败，请重试', 'error');
      }
    } catch (error) {
      console.log('切换状态失败:', error);
      
      if (error.message && error.message.includes('Could not establish connection')) {
        this.showMessage('连接失败，请刷新页面后重试', 'error');
      } else {
        this.showMessage('操作失败，请刷新页面后重试', 'error');
      }
    }
  }

  // 处理文件选择
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isEpub = fileName.endsWith('.epub');
    const isTxt = fileName.endsWith('.txt');
    const isPdf = fileName.endsWith('.pdf');

    // 检查文件类型
    if (!isTxt && !isEpub && !isPdf) {
      this.showMessage('目前只支持 .txt、.epub 和 .pdf 格式的文件', 'error');
      return;
    }

    // 检查文件大小 (限制为100MB)
    if (file.size > 100 * 1024 * 1024) {
      this.showMessage('文件过大，请选择小于100MB的文件', 'error');
      return;
    }

    try {
      console.log('开始读取文件:', file.name, '大小:', file.size, 'bytes');
      
      let content;
      if (isEpub) {
        content = await this.parseEpubFile(file);
      } else if (isPdf) {
        content = await this.parsePdfFile(file);
      } else {
        content = await this.readFileContent(file);
      }
      
      console.log('文件读取完成，开始发送到内容脚本');
      
      const title = file.name.replace(/\.[^/.]+$/, ''); // 移除文件扩展名作为标题
      await this.loadBookToContentScript(content, title);
      this.showMessage('📚 电子书导入成功！', 'success');
      
      // 重置文件输入
      event.target.value = '';
      
      // 更新状态
      setTimeout(() => this.updateStatus(), 500);
      await this.loadBookList(); // 刷新书本列表
    } catch (error) {
      console.error('文件处理失败:', error);
      
      // 根据错误类型显示不同的提示信息
      let errorMessage = '文件读取失败，请重试';
      if (error.message.includes('内容为空')) {
        errorMessage = '文件内容为空，请选择有内容的文件';
      } else if (error.message.includes('编码') || error.message.includes('格式')) {
        errorMessage = '文件编码格式不支持，请使用UTF-8编码的文件';
      } else if (error.message.includes('损坏')) {
        errorMessage = '文件可能已损坏，请重新选择文件';
      } else if (error.message.includes('内容脚本')) {
        errorMessage = '插件通信失败，请刷新页面后重试';
      }
      
      this.showMessage(`❌ ${errorMessage}`, 'error');
    }
  }

  // 加载书本列表
  async loadBookList() {
    try {
      const response = await this.sendMessage({ action: 'getBookList' });
      if (response) {
        this.renderBookList(response.books || {}, response.currentBookId);
      }
    } catch (error) {
      console.error('加载书本列表失败:', error);
    }
  }

  // 渲染书本列表
  renderBookList(books, currentBookId) {
    const bookListSection = document.getElementById('book-list-section');
    const bookList = document.getElementById('book-list');
    
    const bookIds = Object.keys(books);
    
    if (bookIds.length === 0) {
      bookListSection.style.display = 'none';
      return;
    }
    
    bookListSection.style.display = 'block';
    
    if (bookIds.length === 0) {
      bookList.innerHTML = '<div class="empty-list">暂无已导入的书籍</div>';
      return;
    }
    
    bookList.innerHTML = bookIds.map(bookId => {
      const book = books[bookId];
      const isActive = bookId === currentBookId;
      const importDate = new Date(book.importTime).toLocaleDateString();
      const progress = book.totalPages > 0 ? Math.round((book.currentPage / book.totalPages) * 100) : 0;
      
      return `
        <div class="book-item ${isActive ? 'active' : ''}" data-book-id="${bookId}">
          <div class="book-info">
            <div class="book-title" title="${book.title}">${book.title}</div>
            <div class="book-meta">
              <span>进度: ${book.currentPage}/${book.totalPages} (${progress}%)</span>
              <span>导入: ${importDate}</span>
            </div>
          </div>
          <div class="book-actions">
            <button class="book-btn switch-btn" 
                    data-action="switch" 
                    data-book-id="${bookId}"
                    ${isActive ? 'disabled' : ''}>
              ${isActive ? '当前' : '切换'}
            </button>
            <button class="book-btn delete-btn" 
                    data-action="delete" 
                    data-book-id="${bookId}">
              删除
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // 绑定书本操作事件
    this.bindBookListEvents();
  }

  // 绑定书本列表事件
  bindBookListEvents() {
    const bookList = document.getElementById('book-list');
    
    bookList.addEventListener('click', async (event) => {
      const button = event.target.closest('.book-btn');
      if (!button) return;
      
      const action = button.dataset.action;
      const bookId = button.dataset.bookId;
      
      if (action === 'switch') {
        await this.switchBook(bookId);
      } else if (action === 'delete') {
        await this.deleteBook(bookId);
      }
    });
  }

  // 切换书本
  async switchBook(bookId) {
    try {
      const response = await this.sendMessage({
        action: 'switchBook',
        bookId: bookId
      });
      
      if (response && response.success) {
        this.showMessage('📖 书本切换成功！', 'success');
        await this.updateStatus();
        await this.loadBookList();
      } else {
        throw new Error(response?.error || '切换失败');
      }
    } catch (error) {
      console.error('切换书本失败:', error);
      this.showMessage(`❌ 切换失败: ${error.message}`, 'error');
    }
  }

  // 删除书本
  async deleteBook(bookId) {
    if (!confirm('确定要删除这本书吗？此操作不可撤销。')) {
      return;
    }
    
    try {
      const response = await this.sendMessage({
        action: 'deleteBook',
        bookId: bookId
      });
      
      if (response && response.success) {
        this.showMessage('🗑️ 书本删除成功！', 'success');
        await this.updateStatus();
        await this.loadBookList();
      } else {
        throw new Error(response?.error || '删除失败');
      }
    } catch (error) {
      console.error('删除书本失败:', error);
      this.showMessage(`❌ 删除失败: ${error.message}`, 'error');
    }
  }

  // 发送消息到内容脚本的通用方法
  async sendMessage(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('无法获取当前标签页');
      }
      
      // 检查内容脚本是否已加载
      const isLoaded = await this.checkContentScriptLoaded(tab.id);
      
      if (!isLoaded) {
        console.log('内容脚本未加载，尝试注入...');
        const injected = await this.injectContentScript(tab.id);
        
        if (!injected) {
          throw new Error('内容脚本未加载，请刷新页面后重试');
        }
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, message);
      return response;
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  // 读取文件内容
  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          let content = e.target.result;
          
          // 检查是否读取到内容
          if (!content || typeof content !== 'string') {
            reject(new Error('文件内容读取失败或格式不正确'));
            return;
          }
          
          // 简单的文本清理
          content = content
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          
          if (content.length === 0) {
            reject(new Error('文件内容为空'));
            return;
          }
          
          console.log('文件读取成功，内容长度:', content.length);
          resolve(content);
        } catch (error) {
          console.error('文件内容处理错误:', error);
          reject(new Error('文件内容处理失败: ' + error.message));
        }
      };
      
      reader.onerror = (error) => {
        console.error('FileReader错误:', error);
        reject(new Error('文件读取错误，请检查文件是否损坏'));
      };
      
      reader.onabort = () => {
        reject(new Error('文件读取被中断'));
      };
      
      // 尝试以UTF-8编码读取，如果失败则尝试其他编码
      try {
        reader.readAsText(file, 'utf-8');
      } catch (error) {
        console.error('启动文件读取失败:', error);
        reject(new Error('无法启动文件读取'));
      }
    });
  }

  // 解析EPUB文件
  async parseEpubFile(file) {
    return new Promise(async (resolve, reject) => {
      try {
        // 检查JSZip是否可用
        if (typeof JSZip === 'undefined') {
          reject(new Error('JSZip库未加载，无法解析EPUB文件'));
          return;
        }

        console.log('开始解析EPUB文件:', file.name);
        
        // 读取文件为ArrayBuffer
        const arrayBuffer = await this.readFileAsArrayBuffer(file);
        
        // 使用JSZip解析EPUB文件
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // 读取container.xml获取OPF文件路径
        const containerXml = await zip.file('META-INF/container.xml').async('text');
        const opfPath = this.extractOpfPath(containerXml);
        
        if (!opfPath) {
          reject(new Error('无法找到OPF文件路径'));
          return;
        }
        
        // 读取OPF文件
        const opfContent = await zip.file(opfPath).async('text');
        const manifest = this.parseOpfManifest(opfContent);
        const spine = this.parseOpfSpine(opfContent);
        
        // 按spine顺序读取章节内容
        let bookContent = '';
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
        
        for (const spineItem of spine) {
          const manifestItem = manifest.find(item => item.id === spineItem.idref);
          if (manifestItem && manifestItem.mediaType === 'application/xhtml+xml') {
            const chapterPath = opfDir + manifestItem.href;
            try {
              const chapterContent = await zip.file(chapterPath).async('text');
              const textContent = this.extractTextFromXhtml(chapterContent);
              if (textContent.trim()) {
                bookContent += textContent + '\n\n';
              }
            } catch (error) {
              console.warn('读取章节失败:', chapterPath, error);
            }
          }
        }
        
        if (bookContent.trim().length === 0) {
          reject(new Error('EPUB文件中没有找到可读取的文本内容'));
          return;
        }
        
        // 清理文本内容
        bookContent = bookContent
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        console.log('EPUB解析完成，内容长度:', bookContent.length);
        resolve(bookContent);
        
      } catch (error) {
        console.error('EPUB解析失败:', error);
        reject(new Error('EPUB文件解析失败: ' + error.message));
      }
    });
  }

  // 读取文件为ArrayBuffer
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (error) => {
        reject(new Error('文件读取失败'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  // 从container.xml提取OPF文件路径
  extractOpfPath(containerXml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(containerXml, 'text/xml');
      const rootfile = doc.querySelector('rootfile[media-type="application/oebps-package+xml"]');
      return rootfile ? rootfile.getAttribute('full-path') : null;
    } catch (error) {
      console.error('解析container.xml失败:', error);
      return null;
    }
  }

  // 解析OPF文件的manifest部分
  parseOpfManifest(opfContent) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(opfContent, 'text/xml');
      const items = doc.querySelectorAll('manifest item');
      
      return Array.from(items).map(item => ({
        id: item.getAttribute('id'),
        href: item.getAttribute('href'),
        mediaType: item.getAttribute('media-type')
      }));
    } catch (error) {
      console.error('解析OPF manifest失败:', error);
      return [];
    }
  }

  // 解析OPF文件的spine部分
  parseOpfSpine(opfContent) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(opfContent, 'text/xml');
      const itemrefs = doc.querySelectorAll('spine itemref');
      
      return Array.from(itemrefs).map(itemref => ({
        idref: itemref.getAttribute('idref')
      }));
    } catch (error) {
      console.error('解析OPF spine失败:', error);
      return [];
    }
  }

  // 从XHTML内容中提取纯文本
  extractTextFromXhtml(xhtmlContent) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xhtmlContent, 'text/html');
      
      // 移除script和style标签
      const scripts = doc.querySelectorAll('script, style');
      scripts.forEach(el => el.remove());
      
      // 获取body内容，如果没有body则获取整个文档
      const body = doc.querySelector('body') || doc.documentElement;
      
      // 提取文本内容并保持基本的段落结构
      let text = '';
      const walker = doc.createTreeWalker(
        body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        const textContent = node.textContent.trim();
        if (textContent) {
          text += textContent + ' ';
        }
      }
      
      // 处理段落分隔
      const paragraphs = body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
      if (paragraphs.length > 0) {
        text = '';
        paragraphs.forEach(p => {
          const pText = p.textContent.trim();
          if (pText) {
            text += pText + '\n\n';
          }
        });
      }
      
      return text.trim();
    } catch (error) {
      console.error('提取XHTML文本失败:', error);
      return '';
    }
  }

  // 解析PDF文件
  async parsePdfFile(file) {
    return new Promise(async (resolve, reject) => {
      try {
        // 检查PDF.js是否可用
        if (typeof pdfjsLib === 'undefined') {
          reject(new Error('PDF.js库未加载，无法解析PDF文件'));
          return;
        }

        console.log('开始解析PDF文件:', file.name);
        
        // 设置PDF.js worker路径
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
        
        // 读取文件为ArrayBuffer
        const arrayBuffer = await this.readFileAsArrayBuffer(file);
        
        // 使用PDF.js加载PDF文档
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true
        });
        
        const pdf = await loadingTask.promise;
        console.log('PDF加载成功，页数:', pdf.numPages);
        
        let fullText = '';
        
        // 逐页提取文本
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // 提取页面文本
            const pageText = textContent.items
              .map(item => item.str)
              .join(' ')
              .trim();
            
            if (pageText) {
              fullText += pageText + '\n\n';
            }
            
            console.log(`第${pageNum}页文本提取完成，长度:`, pageText.length);
          } catch (pageError) {
            console.warn(`提取第${pageNum}页文本失败:`, pageError);
          }
        }
        
        if (fullText.trim().length === 0) {
          reject(new Error('PDF文件中没有找到可读取的文本内容'));
          return;
        }
        
        // 清理文本内容
        fullText = fullText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        console.log('PDF解析完成，总文本长度:', fullText.length);
        resolve(fullText);
        
      } catch (error) {
        console.error('PDF解析失败:', error);
        reject(new Error('PDF文件解析失败: ' + error.message));
      }
    });
  }

  // 检查内容脚本是否已加载
  async checkContentScriptLoaded(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return response && response.pong;
    } catch (error) {
      return false;
    }
  }

  // 检查页面是否支持内容脚本注入
  isPageSupported(url) {
    if (!url) return false;
    
    // 不支持的页面类型
    const unsupportedProtocols = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://',
      'data:',
      'javascript:'
    ];
    
    return !unsupportedProtocols.some(protocol => url.startsWith(protocol));
  }

  // 注入内容脚本（如果需要）
  async injectContentScript(tabId) {
    try {
      // 获取标签页信息检查URL
      const tab = await chrome.tabs.get(tabId);
      
      if (!this.isPageSupported(tab.url)) {
        console.log('当前页面不支持内容脚本:', tab.url);
        return false;
      }
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content.css']
      });
      
      // 等待脚本初始化
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch (error) {
      console.error('注入内容脚本失败:', error);
      return false;
    }
  }

  // 将电子书内容发送到内容脚本（带重试机制）
  async loadBookToContentScript(content, title = null) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('无法获取当前标签页');
      }
      
      // 首先检查页面是否支持内容脚本
      if (!this.isPageSupported(tab.url)) {
        throw new Error(`当前页面类型不支持使用此扩展。\n请在普通网页（如百度、谷歌等）中使用。\n当前页面: ${tab.url}`);
      }
      
      const maxRetries = 3;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`尝试发送消息到标签页 (第${attempt}次):`, tab.id);
          
          // 检查内容脚本是否已加载
          const isLoaded = await this.checkContentScriptLoaded(tab.id);
          
          if (!isLoaded) {
            console.log('内容脚本未加载，尝试注入...');
            const injected = await this.injectContentScript(tab.id);
            
            if (!injected) {
              throw new Error('无法注入内容脚本，请手动刷新页面');
            }
          }
          
          // 发送消息
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'loadBook',
            bookContent: content,
            title: title
          });

          console.log('内容脚本响应:', response);
          
          if (!response || !response.success) {
            throw new Error('内容脚本响应失败');
          }
          
          // 成功，退出重试循环
          return;
          
        } catch (error) {
          console.error(`第${attempt}次尝试失败:`, error);
          lastError = error;
          
          // 如果是页面不支持的错误，不需要重试
          if (error.message && error.message.includes('当前页面类型不支持')) {
            throw error;
          }
          
          // 如果不是最后一次尝试，等待一段时间后重试
          if (attempt < maxRetries) {
            console.log(`等待${attempt * 500}ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 500));
          }
        }
      }
      
      // 所有重试都失败了
      console.error('所有重试都失败了，最后的错误:', lastError);
      
      // 根据错误类型提供更具体的错误信息
      if (lastError.message && lastError.message.includes('Could not establish connection')) {
        throw new Error('发送到内容脚本失败: Error: Could not establish connection. Receiving end does not exist.');
      } else if (lastError.message && lastError.message.includes('无法注入')) {
        throw new Error('文件处理失败: Error: 内容脚本未加载，请刷新页面后重试');
      } else {
        throw new Error('文件处理失败: Error: 内容脚本未加载，请刷新页面后重试');
      }
      
    } catch (error) {
      // 如果是页面不支持的错误，直接抛出
      if (error.message && error.message.includes('当前页面类型不支持')) {
        throw error;
      }
      
      // 其他错误按原来的方式处理
      throw error;
    }
  }

  // 显示消息
  showMessage(message, type = 'info') {
    // 创建临时消息元素
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      max-width: 250px;
      text-align: center;
      ${type === 'success' ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : ''}
      ${type === 'error' ? 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;' : ''}
      ${type === 'info' ? 'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;' : ''}
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 3000);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});