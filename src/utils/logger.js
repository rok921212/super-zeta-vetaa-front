// Frontend logger with consistent formatting
const isDev = process.env.NODE_ENV === 'development';

const logger = {
  // Core logging methods
  error: (...args) => console.error('❌', ...args),
  warn: (...args) => console.warn('⚠️', ...args),
  info: (...args) => console.log('ℹ️', ...args),
  success: (...args) => console.log('✅', ...args),
  debug: isDev ? (...args) => console.debug('🐛', ...args) : () => {},
  
  // API request logger
  api: {
    request: (method, url) => 
      isDev && console.log('📤', `${method} ${url}`),
    response: (method, url, status, time) => {
      const statusText = status >= 400 ? `❌ ${status}` : `✅ ${status}`;
      console.log(`📥 ${method} ${url} → ${statusText} (${time}ms)`);
    },
    error: (method, url, error) => 
      console.error(`❌ API: ${method} ${url} → ${error.message || 'Error'}`)
  },
  
  // Component lifecycle
  component: {
    mount: (name) => isDev && console.log(`🔄 ${name} mounted`),
    update: (name) => isDev && console.log(`🔄 ${name} updated`),
    unmount: (name) => isDev && console.log(`🗑️ ${name} unmounted`)
  },
  
  // State management
  state: {
    update: (context, prevState, nextState) => {
      if (!isDev) return;
      console.group(`🔄 ${context} state update`);
      console.log('Previous:', prevState);
      console.log('Next:', nextState);
      console.groupEnd();
    },
    error: (context, error) => 
      console.error(`❌ ${context} state error:`, error)
  }
};

export default logger;
