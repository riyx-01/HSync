(function(){
  function el(q){return document.querySelector(q);} 
  function make(tag, cls){var x=document.createElement(tag); if(cls) x.className=cls; return x;}
  
  var fab, widget=null, body=null, input=null, send=null;

  function addBubble(text, who){
    if(!body) return; 
    var row = make('div','row ' + (who==='bot'?'bot':'you')); 
    var bubble = make('div','bubble ' + (who==='bot'?'bot':'you')); 
    
    // Simple Markdown formatting
    var formatted = text.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
    
    // Bold: **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Bullet points (handle * or - at start of lines)
    formatted = formatted.replace(/^\s*[\*\-]\s+/gm, '• ');
    
    // Convert newlines to line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    bubble.innerHTML = formatted; 
    
    row.appendChild(bubble); 
    body.appendChild(row); 
    body.scrollTop = body.scrollHeight; 
    return bubble;
  }

  function sendMsg(){ 
    var t = (input && input.value||'').trim(); 
    if(!t) return; 
    
    addBubble(t,'you'); 
    input.value='';
    
    if(input) input.disabled = true;
    if(send) send.disabled = true;

    fetch('/message',{
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body:JSON.stringify({text:t})
    })
    .then(function(r){return r.json();})
    .then(function(data){
      var msgs = data.messages||[]; 
      var i=0; 
      function step(){ 
        if(i>=msgs.length) {
          if(input) { input.disabled = false; input.focus(); }
          if(send) send.disabled = false;
          return; 
        }
        var m = msgs[i++]; 
        if(typeof m==='string'){ 
          addBubble(m,'bot'); 
        } 
        setTimeout(step, 150); 
      } 
      step();
    })
    .catch(function(err){
      console.error(err);
      addBubble("Sorry, something went wrong (likely quota exceeded). Please try again later.", 'bot');
      if(input) input.disabled = false;
      if(send) send.disabled = false;
    });
  }

  function toggleChat(){
    if(!widget) createWidget();
    widget.classList.toggle('active');
    if(widget.classList.contains('active') && input) input.focus();
  }

  function createWidget(){
    widget = make('div','chat-widget');
    widget.innerHTML = '<div class="chat-header"><span>HSync Assistant</span><button class="close-chat" style="background:none;border:none;color:white;cursor:pointer;font-size:20px;">×</button></div>'+
                      '<div id="chat-body" class="chat-body"></div>'+
                      '<div class="chat-input-row"><input id="chat-input" class="chat-input" type="text" placeholder="Type a message"><button id="chat-send" class="chat-send">Send</button></div>';
    document.body.appendChild(widget);
    
    body = widget.querySelector('#chat-body'); 
    input = widget.querySelector('#chat-input'); 
    send = widget.querySelector('#chat-send');
    
    var closeBtn = widget.querySelector('.close-chat');
    if(closeBtn) closeBtn.addEventListener('click', toggleChat);

    if(send) send.addEventListener('click', sendMsg); 
    if(input) input.addEventListener('keydown', function(e){ if(e.key==='Enter') sendMsg(); });
    
    addBubble("Hi! I'm HSync Assistant. How can I help you?", 'bot');
  }

  function setup(){
    // Check if we are in fullscreen mode (main page has #chat-body directly)
    var staticBody = el('#chat-body');
    if(staticBody && !el('#chat-fab')) {
      // Fullscreen mode (no FAB, just attach to existing elements)
      body = staticBody;
      input = el('#chat-input');
      send = el('#chat-send');
      if(send) send.addEventListener('click', sendMsg);
      if(input) input.addEventListener('keydown', function(e){ if(e.key==='Enter') sendMsg(); });
    } else {
      // Floating mode
      fab = el('#chat-fab');
      if(fab) {
        fab.addEventListener('click', toggleChat);
      }
    }
  }
  
  function setupTheme() {
    var toggle = document.getElementById('theme-toggle');
    var logo = document.getElementById('brand-logo');
    if(!toggle) return; 
    
    var saved = localStorage.getItem('theme');
    if(saved === 'dark') {
      document.body.classList.add('dark-mode');
      toggle.textContent = '☀️';
      if(logo) logo.src = '/static/logo-dark.svg';
    }
    
    toggle.onclick = function(){ 
        document.body.classList.toggle('dark-mode');
        var isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        toggle.textContent = isDark ? '☀️' : '🌙';
        if(logo) logo.src = isDark ? '/static/logo-dark.svg' : '/static/logo.svg';
    };
  }

  function openProfile() {
    var modal = document.getElementById('profileModal');
    if(modal) {
        modal.classList.add('active');
        fetchHistory(); // Fetch history when opening profile
    }
  }

  function closeProfile() {
    var modal = document.getElementById('profileModal');
    if(modal) modal.classList.remove('active');
  }

  function fetchHistory() {
      var historyList = document.querySelector('.history-list');
      if(!historyList) return;
      
      historyList.innerHTML = '<div class="history-item">Loading history...</div>';
      
      fetch('/api/history')
        .then(function(r){ return r.json(); })
        .then(function(data){
            historyList.innerHTML = '';
            if(data.length === 0) {
                historyList.innerHTML = '<div class="history-item">No history found.</div>';
                return;
            }
            
            data.forEach(function(item){
                var div = document.createElement('div');
                div.className = 'history-item';
                div.onclick = function() { window.location.href = '/history/' + item.id; };
                
                // Truncate symptoms if too long (backup for title)
                var displayTitle = item.title || item.symptoms;
                if(displayTitle.length > 40) displayTitle = displayTitle.substring(0, 40) + '...';
                
                div.innerHTML = '<div class="history-date">' + item.date + ' <span style="font-size:0.8em; opacity:0.7">at ' + (item.time || '') + '</span></div>' +
                                '<div class="history-symptoms">' + displayTitle + '</div>';
                historyList.appendChild(div);
            });
        })
        .catch(function(err){
            console.error(err);
            historyList.innerHTML = '<div class="history-item">Failed to load history.</div>';
        });
  }

  // Expose to global scope for HTML onclick attributes
  window.openProfile = openProfile;
  window.closeProfile = closeProfile;

  document.addEventListener('DOMContentLoaded', function(){
    setup();
    setupTheme();
    
    // Close profile on click outside
    document.addEventListener('click', function(e) {
        var modal = document.getElementById('profileModal');
        if (modal && e.target === modal) {
            closeProfile();
        }
    });
  });
})();
