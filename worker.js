export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ➤ API: 保存文章 (仅限 POST) - 🔐 改用 Basic Auth 验证
    if (path === '/api/save' && request.method === 'POST') {
      // 从 Authorization header 验证身份
      const auth = request.headers.get('Authorization');
      const expectedAuth = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
      
      if (!auth || auth !== expectedAuth) {
        return new Response('Forbidden', { status: 403 });
      }
      
      const body = await request.json();
      
      try {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO posts (slug, title, content, is_encrypted, created_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(body.slug, body.title, body.content, body.isEncrypted ? 1 : 0, Date.now()).run();
        return new Response('Saved', { status: 200 });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ➤ API: 删除文章 (仅限 DELETE) - 🔐 Basic Auth 验证
    if (path === '/api/delete' && request.method === 'DELETE') {
      const auth = request.headers.get('Authorization');
      const expectedAuth = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
      
      if (!auth || auth !== expectedAuth) {
        return new Response('Forbidden', { status: 403 });
      }

      const body = await request.json();
      const slug = body.slug;

      if (!slug) {
        return new Response('Missing slug', { status: 400 });
      }

      try {
        await env.DB.prepare(
          `DELETE FROM posts WHERE slug = ?`
        ).bind(slug).run();
        return new Response('Deleted', { status: 200 });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ➤ API: 获取所有文章列表 (仅限 GET) - 🔐 Basic Auth 验证
    if (path === '/api/posts' && request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      const expectedAuth = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
      
      if (!auth || auth !== expectedAuth) {
        return new Response('Forbidden', { status: 403 });
      }

      try {
        const { results } = await env.DB.prepare(
          "SELECT slug, title, created_at, is_encrypted FROM posts ORDER BY created_at DESC"
        ).all();
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ➤ 路由: 首页 (列表)
    if (path === '/') {
      const { results } = await env.DB.prepare("SELECT slug, title, created_at, is_encrypted FROM posts ORDER BY created_at DESC").all();
      return new Response(renderHome(results), htmlHeader());
    }

    // ➤ 路由: 后台写作 - 🔐 HTTP Basic Auth
    if (path === '/admin') {
      const auth = request.headers.get('Authorization');
      const expectedAuth = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
      
      if (!auth || auth !== expectedAuth) {
        return new Response('Unauthorized', { 
          status: 401, 
          headers: { 
            'WWW-Authenticate': 'Basic realm="CipherLog Admin"',
            'Content-Type': 'text/html;charset=utf-8'
          }
        });
      }
      
      return new Response(renderAdmin(), htmlHeader());
    }

    // ➤ 路由: 文章详情
    const slug = path.slice(1); // 移除开头的 /
    const post = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();

    if (!post) return new Response("404 Not Found", { status: 404 });
    return new Response(renderPost(post), htmlHeader());
  }
};

// ==========================================
// 🎨 极简 UI 渲染引擎 (HTML/CSS)
// ==========================================

function htmlHeader() {
  return { 
    headers: { 
      "Content-Type": "text/html;charset=utf-8",
      "Content-Security-Policy": "default-src 'self' 'unsafe-inline'" // 🔐 CSP 防护
    } 
  };
}

const CSS = `
<style>
  :root { 
    --bg: #0F0F0F; 
    --fg: #4CAF50; 
    --dim: #888; 
    --link: #E8E8E8; 
  }
  body { 
    background: var(--bg); 
    color: var(--fg); 
    font-family: 'Courier New', monospace; 
    max-width: 700px; 
    margin: 0 auto; 
    padding: 40px 20px; 
    line-height: 1.6; 
  }
  a { 
    color: var(--link); 
    text-decoration: none; 
    border-bottom: 1px dashed var(--dim); 
  }
  a:hover { 
    border-bottom: 1px solid var(--fg); 
  }
  h1 { 
    font-size: 24px; 
    margin-bottom: 40px; 
    border-bottom: 2px solid var(--fg); 
    padding-bottom: 10px; 
  }
  h2 {
    font-size: 18px;
    margin-top: 30px;
    margin-bottom: 20px;
    color: #667eea;
  }
  .meta { 
    font-size: 12px; 
    color: var(--dim); 
    margin-bottom: 20px; 
    display: block; 
  }
  .list-item { 
    margin-bottom: 15px; 
    display: flex; 
    justify-content: space-between; 
    align-items: center;
  }
  .list-item-title {
    flex: 1;
  }
  .lock-icon { 
    margin-left: 10px; 
    color: #FF6B6B; 
  }
  .delete-btn {
    margin-left: 15px;
    background: #FF6B6B;
    color: #0F0F0F;
    border: none;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    font-family: inherit;
  }
  .delete-btn:hover {
    background: #FF5252;
  }
  .tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 30px;
    border-bottom: 1px solid var(--dim);
  }
  .tab-btn {
    background: none;
    color: var(--dim);
    border: none;
    padding: 10px 20px;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    border-bottom: 2px solid transparent;
  }
  .tab-btn.active {
    color: var(--fg);
    border-bottom-color: var(--fg);
  }
  .tab-content {
    display: none;
  }
  .tab-content.active {
    display: block;
  }
  input, textarea { 
    background: #1C1C1C; 
    color: #E8E8E8; 
    border: 1px solid var(--dim); 
    width: 100%; 
    padding: 10px; 
    margin-bottom: 10px; 
    font-family: inherit; 
    box-sizing: border-box;
  }
  button { 
    background: var(--fg); 
    color: #0A0A0A; 
    border: none; 
    padding: 10px 20px; 
    cursor: pointer; 
    font-weight: bold; 
  }
  button:hover {
    opacity: 0.9;
  }
  #decrypt-box { 
    border: 1px solid #333; 
    padding: 20px; 
    text-align: center; 
    margin-top: 50px; 
  }
  .posts-list {
    max-height: 400px;
    overflow-y: auto;
  }
  .loading {
    color: var(--dim);
    font-style: italic;
  }
</style>
`;

// 1. 首页渲染
function renderHome(posts) {
  const list = posts.map(p => `
    <div class="list-item">
      <div class="list-item-title">
        <a href="/${p.slug}">${p.title} ${p.is_encrypted ? '<span class="lock-icon">🔐</span>' : ''}</a>
      </div>
      <span class="meta">${new Date(p.created_at).toISOString().split('T')[0]}</span>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><title>CipherLog</title>${CSS}</head><body>
    <h1>CipherLog</h1>
    ${list}

  </body></html>`;
}

// 2. 文章详情渲染 (含解密逻辑) - 🔐 支持独立 Salt
function renderPost(post) {
  // 如果是加密文章，返回解密界面；否则直接显示
  const contentDisplay = post.is_encrypted 
    ? `<div id="decrypt-box">
         <p>🔐 此内容已加密</p>
         <input type="password" id="unlock-pass" placeholder="输入密钥解密...">
         <button onclick="unlock()">Decrypt</button>
       </div>
       <div id="real-content" style="display:none"></div>
       <div id="raw-cipher" style="display:none">${post.content}</div>`
    : `<div style="white-space: pre-wrap;">${post.content}</div>`;

  return `<!DOCTYPE html><html><head><title>${post.title}</title>${CSS}</head><body>
    <a href="/">← Back</a>
    <h1>${post.title}</h1>
    <span class="meta">${new Date(post.created_at).toLocaleString()}</span>
    ${contentDisplay}
    
    <script>
      async function unlock() {
        const pass = document.getElementById('unlock-pass').value;
        const cipherText = document.getElementById('raw-cipher').innerText;
        try {
          const plain = await decrypt(cipherText, pass);
          document.getElementById('decrypt-box').style.display = 'none';
          document.getElementById('real-content').style.display = 'block';
          document.getElementById('real-content').innerText = plain;
        } catch(e) { 
          alert('密码错误'); 
        }
      }

      // 🔐 改进版解密：支持独立 Salt 格式 (salt:iv:cipher)
      async function decrypt(data, password) {
        const parts = data.split(':');
        
        // 兼容旧格式 (iv:cipher) 和新格式 (salt:iv:cipher)
        let salt, iv, cipherData;
        
        if (parts.length === 2) {
          // 旧格式：使用固定 Salt
          salt = new TextEncoder().encode("CipherLogSalt");
          iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
          cipherData = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
        } else if (parts.length === 3) {
          // 新格式：使用独立 Salt
          salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
          iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
          cipherData = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
        } else {
          throw new Error('Invalid format');
        }
        
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv }, 
          key, 
          cipherData
        );
        return new TextDecoder().decode(decrypted);
      }

      async function deriveKey(password, salt) {
        const keyMaterial = await crypto.subtle.importKey(
          "raw", 
          new TextEncoder().encode(password), 
          "PBKDF2", 
          false, 
          ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
          { 
            name: "PBKDF2", 
            salt: salt, 
            iterations: 600000, 
            hash: "SHA-256" 
          }, 
          keyMaterial, 
          { name: "AES-GCM", length: 256 }, 
          false, 
          ["decrypt"]
        );
      }
    </script>
  </body></html>`;
}

// 3. 后台渲染 (含新建和管理两个标签页) - 🔐 移除 key 传递 + 独立 Salt
function renderAdmin() {
  return `<!DOCTYPE html><html><head><title>Admin Panel</title>${CSS}</head><body>
    <h1>CipherLog Admin</h1>
    
    <div class="tabs">
      <button class="tab-btn active" id="btn-new" onclick="switchTab('new', this)">📝 New Entry</button>
      <button class="tab-btn" id="btn-manage" onclick="switchTab('manage', this)">📋 Manage Posts</button>
    </div>

    <!-- New Entry Tab -->
    <div id="new" class="tab-content active">
      <input id="slug" placeholder="Slug (e.g. my-first-post)">
      <input id="title" placeholder="Title">
      <textarea id="content" rows="15" placeholder="Write something..."></textarea>
      <div style="margin: 10px 0;">
        <label><input type="checkbox" id="encrypt-toggle" style="width:auto"> 🔐 Encrypt this post</label>
        <input id="enc-pass" placeholder="Encryption Password (Required if locked)" style="display:none; margin-top:5px;">
      </div>
      <button onclick="publish()">Publish</button>
    </div>

    <!-- Manage Posts Tab -->
    <div id="manage" class="tab-content">
      <div id="posts-list" class="posts-list">
        <p class="loading">Loading posts...</p>
      </div>
    </div>

    <script>
      // 标签页切换
      function switchTab(tab, btn) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tab).classList.add('active');
        if (btn) btn.classList.add('active');
        
        if (tab === 'manage') {
          loadPosts();
        }
      }

      // 加载文章列表
      async function loadPosts() {
        const container = document.getElementById('posts-list');
        try {
          const res = await fetch('/api/posts');
          if (!res.ok) throw new Error('Failed to load posts');
          
          const posts = await res.json();
          if (posts.length === 0) {
            container.innerHTML = '<p class="loading">No posts yet.</p>';
            return;
          }

          const html = posts.map(p => \`
            <div class="list-item">
              <div class="list-item-title">
                \${p.title} \${p.is_encrypted ? '<span class="lock-icon">🔐</span>' : ''}
              </div>
              <span class="meta">\${new Date(p.created_at).toISOString().split('T')[0]}</span>
              <button class="delete-btn" onclick="deletePost('\${p.slug}')">🗑 Delete</button>
            </div>
          \`).join('');
          
          container.innerHTML = html;
        } catch(e) {
          container.innerHTML = '<p class="loading">Error: ' + e.message + '</p>';
        }
      }

      // 删除文章
      async function deletePost(slug) {
        if (!confirm('确定要删除这篇文章吗？')) return;
        
        try {
          const res = await fetch('/api/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: slug })
          });
          
          if (res.ok) {
            loadPosts();
          } else {
            alert('Delete failed: ' + await res.text());
          }
        } catch(e) {
          alert('Error: ' + e.message);
        }
      }

      // 新建文章
      const checkbox = document.getElementById('encrypt-toggle');
      checkbox.onchange = () => document.getElementById('enc-pass').style.display = checkbox.checked ? 'block' : 'none';

      async function publish() {
        const slug = document.getElementById('slug').value;
        const title = document.getElementById('title').value;
        let content = document.getElementById('content').value;
        const isEncrypted = checkbox.checked;
        const pass = document.getElementById('enc-pass').value;

        if (isEncrypted && pass) {
          content = await encrypt(content, pass);
        }

        const res = await fetch('/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ slug, title, content, isEncrypted })
        });
        
        if (res.ok) {
          alert('Published!');
          document.getElementById('slug').value = '';
          document.getElementById('title').value = '';
          document.getElementById('content').value = '';
          checkbox.checked = false;
          document.getElementById('enc-pass').style.display = 'none';
          loadPosts();
          switchTab('manage');
        } else {
          alert('Publish failed: ' + await res.text());
        }
      }

      // 🔐 改进版加密：使用独立 Salt，格式 salt:iv:cipher
      async function encrypt(text, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);
        
        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv }, 
          key, 
          new TextEncoder().encode(text)
        );
        
        return btoa(String.fromCharCode(...salt)) + ':' + 
               btoa(String.fromCharCode(...iv)) + ':' + 
               btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      }

      async function deriveKey(password, salt) {
        const keyMaterial = await crypto.subtle.importKey(
          "raw", 
          new TextEncoder().encode(password), 
          "PBKDF2", 
          false, 
          ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
          { 
            name: "PBKDF2", 
            salt: salt, 
            iterations: 600000, 
            hash: "SHA-256" 
          }, 
          keyMaterial, 
          { name: "AES-GCM", length: 256 }, 
          false, 
          ["encrypt"]
        );
      }
    </script>
  </body></html>`;
}
