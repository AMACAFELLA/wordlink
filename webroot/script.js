class WordLinkGame {
  constructor() {
    this.initializeElements();
    this.initializeState();
    this.setupEventListeners();
    this.setupMessageHandling();
    this.setupLeaderboardTabs();
    this.showMenu();
  }

  initializeElements() {
    this.menuScreen = document.getElementById('menu-screen');
    this.gameScreen = document.getElementById('game-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.leaderboardScreen = document.getElementById('leaderboard-screen');
    this.scoreEl = document.getElementById('score');
    this.comboEl = document.getElementById('combo');
    this.timeLeftEl = document.getElementById('time-left');
    this.currentTopicEl = document.getElementById('current-topic');
    this.wordInputEl = document.getElementById('word-input');
    this.chainContainerEl = document.getElementById('chain-container');
    this.finalScoreEl = document.getElementById('final-score');
    this.playerNameEl = document.getElementById('player-name');
    this.startBtn = document.getElementById('start-btn');
    this.dailyChallengeBtn = document.getElementById('daily-challenge-btn');
    this.submitBtn = document.getElementById('submit-btn');
    this.leaderboardBtn = document.getElementById('leaderboard-btn');
    this.howToPlayBtn = document.getElementById('how-to-play-btn');
    this.playAgainBtn = document.getElementById('play-again-btn');
    this.backToMenuBtn = document.getElementById('back-to-menu-btn');
    this.howToPlayModal = document.getElementById('how-to-play-modal');
    this.leaderboardModal = null;
  }

  initializeState() {
    this.score = 0;
    this.combo = 1;
    this.timeLeft = 60;
    this.chain = [];
    this.topics = []; // Will be populated from backend
    this.username = '';
    this.subredditName = '';
    this.snoovatarUrl = '';
    this.currentTopic = '';
    this.topicWords = [];
    this.allTopicWords = {};
    this.gameActive = false;
    this.isDailyChallenge = false;
    this.t2 = '';  // User ID
    this.t3 = '';  // Post ID
    this.highestScore = 0;
    
    // Initialize daily challenge date
    const storedDate = localStorage.getItem('lastDailyChallengeDate');
    this.lastDailyChallengeDate = storedDate ? new Date(storedDate) : null;
    
    // Validate the stored date
    if (this.lastDailyChallengeDate) {
      const now = new Date();
      // Clear invalid dates or dates from previous days
      if (isNaN(this.lastDailyChallengeDate.getTime()) || 
          this.lastDailyChallengeDate.toDateString() !== now.toDateString()) {
        this.lastDailyChallengeDate = null;
        localStorage.removeItem('lastDailyChallengeDate');
      }
    }
    
    this.nextDailyChallengeTime = null;
  }

  setupEventListeners() {
    this.startBtn?.addEventListener('click', () => this.startGame(false));
    this.dailyChallengeBtn?.addEventListener('click', () => this.handleDailyChallenge());
    this.submitBtn?.addEventListener('click', () => this.handleWordSubmit());
    this.playAgainBtn?.addEventListener('click', () => this.resetGame());
    this.leaderboardBtn?.addEventListener('click', () => {
      this.leaderboardRequested = true; // Set flag when leaderboard button is clicked
      this.showLeaderboard();
    });
    this.backToMenuBtn?.addEventListener('click', () => this.showMenu());
    this.howToPlayBtn?.addEventListener('click', () => this.showHowToPlay());
    this.wordInputEl?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleWordSubmit();
      }
    });
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.howToPlayModal) this.howToPlayModal.classList.remove('active');
      });
    });

    const hintButton = document.getElementById('hint-btn');
    const skipButton = document.getElementById('skip-btn');

    hintButton.addEventListener('click', () => this.provideHint());
    skipButton.addEventListener('click', () => this.skipTopic());
  }

  setupMessageHandling() {
    window.addEventListener('message', (event) => {
      if (!event.data) return;
    
      // Handle setImmediate messages silently
      if (typeof event.data === 'string' && event.data.startsWith('setImmediate')) {
        return;
      }
        
      // Unwrap the nested message structure
      let message = event.data;
      while (message?.type === 'devvit-message' && (message?.data?.message || message?.data)) {
        message = message.data.message || message.data;
      }
        
      // Handle topic words response
      if (message.type === 'topicWordsResponse') {
        const { topic, words } = message.data;
        if (topic === this.currentTopic) {
          this.topicWords = words;
        }
      }
      // Handle other message types
      else if (message.type === 'initialData') {
        this.handleInitialData(message.data);
        // Request words for initial topic
        if (this.currentTopic) {
          this.requestTopicWords(this.currentTopic);
        }
      } else if (message.type === 'wordSubmissionConfirmed') {
        this.handleWordConfirmation(message.data);
      } else if (message.type === 'leaderboardData') {
        this.updateLeaderboard(message.data);
      } else if (message.type === 'error') {
        this.showError(message.data.message);
      }
    });
    // Send ready message to parent
    window.parent.postMessage({
      type: 'ready'
    }, '*');
  }

  setupLeaderboardTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
      
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => {
          if (content.id === `${tab}-leaderboard`) {
            content.classList.add('active');
          } else {
            content.classList.remove('active');
          }
        });
        this.fetchLeaderboard(tab);
      });
    });
  }

  getDailyChallenge() {
    if (!this.topics || !this.topics.length) {
      return null;
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    // Use the date to deterministically select a topic
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const topicIndex = dayOfYear % this.topics.length;
    const selectedTopic = this.topics[topicIndex];
    
    const topicStr = typeof selectedTopic === 'string' ? selectedTopic : 
                    selectedTopic && typeof selectedTopic.topic === 'string' ? selectedTopic.topic :
                    null;
    
    if (!topicStr) {
      return null;
    }
    
    return {
      topic: topicStr,
      date: dateStr
    };
  }

  startGame(isDaily = false) {
    this.isDailyChallenge = isDaily;
    this.gameActive = true;
    this.score = 0;
    this.combo = 1;
    this.timeLeft = 60;
    this.chain = [];
    this.chainContainerEl.innerHTML = '';

    // Update button visibility based on game mode
    this.updateButtonVisibility();

    // Set topic based on game mode
    if (isDaily) {
      this.currentTopic = this.getDailyChallenge().topic;
    } else {
      // Get a random topic that's different from the current one
      let newTopic;
      do {
        const randomIndex = Math.floor(Math.random() * this.topics.length);
        const randomTopic = this.topics[randomIndex];
        newTopic = typeof randomTopic === 'string' ? randomTopic : 
                  randomTopic && typeof randomTopic.topic === 'string' ? randomTopic.topic :
                  null;
      } while (newTopic === this.currentTopic && this.topics.length > 1);
      
      // Update current topic and clear topic words
      this.currentTopic = newTopic;
      this.topicWords = [];
      
      // Request words for the new topic
      this.requestTopicWords(newTopic);
    }

    if (this.currentTopicEl) {
      this.currentTopicEl.textContent = this.currentTopic;
    }

    // Show game screen and start
    this.hideAllScreens();
    this.gameScreen.classList.add('active');
    this.wordInputEl?.focus();
    this.startTimer();
  }

  updateButtonVisibility() {
    const hintBtn = document.getElementById('hint-btn');
    const skipBtn = document.getElementById('skip-btn');

    if (hintBtn) {
      hintBtn.style.display = this.isDailyChallenge ? 'inline-block' : 'none';
    }

    if (skipBtn) {
      skipBtn.style.display = this.isDailyChallenge ? 'none' : 'inline-block';
    }
  }

  requestTopicWords(topic) {
    window.parent.postMessage({
      type: 'getTopicWords',
      data: { topic }
    }, '*');
  }

  async getWordsForTopic(topic) {
    window.postMessage({
      type: 'getTopicWords',
      data: { topic }
    }, '*');
  }

  handleInitialData(data) {
    this.username = data.username || '';
    this.subredditName = data.subreddit || '';
    this.snoovatarUrl = data.snoovatarUrl || '';
    this.t2 = data.t2 || '';
    this.t3 = data.t3 || '';
    
    // Parse topics data
    if (data.topics && Array.isArray(data.topics)) {
      this.topics = data.topics.map(topic => {
        if (typeof topic === 'string') {
          return { topic: topic, words: [] };
        }
        return topic;
      });
    }

    // Store initial topic words
    if (data.currentTopic && data.topicWords) {
      this.currentTopic = data.currentTopic;
      this.topicWords = data.topicWords;
    }

    // Handle daily challenge data
    if (data.lastDailyChallengeDate) {
      const serverDate = new Date(data.lastDailyChallengeDate);
      // Use the most recent date between local storage and server
      if (!this.lastDailyChallengeDate || 
          serverDate > this.lastDailyChallengeDate) {
        this.lastDailyChallengeDate = serverDate;
        localStorage.setItem('lastDailyChallengeDate', serverDate.toISOString());
      }
      this.updateDailyChallengeButton();
    }

    // Set snoovatar if available
    if (this.snoovatarUrl) {
      this.setSnoovatar();
    }
  }

  async handleGameOver() {
    this.gameActive = false;
    clearInterval(this.timer);
    // Update highest score if current score is higher
    if (this.score > this.highestScore) {
      this.highestScore = this.score;
    }
    // Show game over screen
    this.hideAllScreens();
    this.gameOverScreen.classList.add('active');
    if (this.finalScoreEl) {
      this.finalScoreEl.textContent = this.score;
    }
    // Update game over message
    const gameOverMessageEl = document.getElementById('game-over-message');
    if (gameOverMessageEl) {
      gameOverMessageEl.textContent = this.getGameOverMessage(this.score, this.username);
    }
    
    // Submit score to leaderboard
    window.parent.postMessage({
      type: 'submitScore',
      data: {
        score: this.score,
        playerName: this.username,
        t2: this.t2,
        t3: this.t3,
        subreddit: this.subredditName,
        isDaily: this.isDailyChallenge
      }
    }, '*');
    
    // Fetch all leaderboard tabs
    const tabs = ['this-subreddit', 'all-subreddits', 'daily-challenge'];
    tabs.forEach(tab => this.fetchLeaderboard(tab));
  }

  async submitScore(score, isDaily = false) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      await window.parent.postMessage({
        type: 'submitScore',
        data: {
          playerName: this.username,
          score,
          t2: this.t2,
          t3: this.t3,
          subreddit: this.subredditName,
          isDaily: isDaily,
          date: isDaily ? today : undefined,
          topic: this.currentTopic
        },
      }, '*');
      
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  }

  updateLeaderboard(data) {
    const { entries, tab } = data;
    const tabBody = document.getElementById(`${tab}-leaderboard-body`);
    if (!tabBody) {
      console.error('Could not find leaderboard body element for tab:', tab);
      return;
    }

    // Clear existing entries
    tabBody.innerHTML = '';

    // Handle empty leaderboard
    if (!entries || entries.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = (tab === 'all-subreddits' || tab === 'daily-challenge') ? 4 : 3;
      emptyCell.className = 'chalk-text chalk-white';
      emptyCell.style.textAlign = 'center';
      emptyCell.textContent = 'No scores yet! Be the first to play!';
      emptyRow.className = 'empty-state';
      emptyRow.appendChild(emptyCell);
      tabBody.appendChild(emptyRow);
      return;
    }

    // Limit entries to top 10 for daily challenge
    const displayEntries = tab === 'daily-challenge' ? entries.slice(0, 10) : entries;

    // Add entries to the leaderboard
    displayEntries.forEach((entry, index) => {
      const row = document.createElement('tr');
      row.className = entry.username === this.username ? 'current-user' : '';
      
      // Add blur class only for all-subreddits tab entries except the first one
      if (tab === 'all-subreddits' && index > 0) {
        row.classList.add('blurred');
        
        // Add message about Global Redis if it's the first blurred row
        if (index === 1) {
          const messageRow = document.createElement('tr');
          const messageCell = document.createElement('td');
          messageCell.colSpan = 4;
          messageCell.className = 'chalk-text chalk-white redis-message';
          messageCell.textContent = "This would be nice to have, but we're waiting for something called Global Redis—not to be confused with global domination.";
          messageRow.appendChild(messageCell);
          tabBody.appendChild(messageRow);
        }
      }

      // Rank cell with medal for top 3
      const rankCell = document.createElement('td');
      let rankText = (index + 1).toString();
      if (index === 0) rankText = '🥇 ' + rankText;
      else if (index === 1) rankText = '🥈 ' + rankText;
      else if (index === 2) rankText = '🥉 ' + rankText;
      rankCell.textContent = rankText;
      rankCell.className = 'chalk-text chalk-yellow';
      row.appendChild(rankCell);

      // Username cell
      const usernameCell = document.createElement('td');
      usernameCell.textContent = entry.username;
      usernameCell.className = 'chalk-text chalk-white';
      if (entry.username === this.username) {
        usernameCell.className += ' current-user';
      }
      row.appendChild(usernameCell);

      // Score cell
      const scoreCell = document.createElement('td');
      scoreCell.textContent = entry.score.toLocaleString();  // Format large numbers
      scoreCell.className = 'chalk-text chalk-yellow';
      row.appendChild(scoreCell);

      // Add subreddit cell for all-subreddits tab
      if (tab === 'all-subreddits') {
        const subredditCell = document.createElement('td');
        subredditCell.textContent = entry.subreddit;
        subredditCell.className = 'chalk-text chalk-white';
        row.appendChild(subredditCell);
      }

      tabBody.appendChild(row);
    });
  }

  fetchLeaderboard(tab = 'this-subreddit') {
    window.parent.postMessage({
      type: 'fetchLeaderboard',
      data: {
        tab,
        t3: this.t3,
        isDaily: this.isDailyChallenge
      }
    }, '*');
  }

  showLeaderboard() {
    this.hideAllScreens();
    this.leaderboardScreen.classList.add('active');
    
    // If we're in a daily challenge, show the daily challenge leaderboard
    if (this.isDailyChallenge) {
      this.fetchLeaderboard('daily-challenge');
      // Switch to daily challenge tab if it exists
      const dailyTab = document.querySelector('[data-tab="daily-challenge"]');
      if (dailyTab) {
        dailyTab.click();
      }
    } else {
      this.fetchLeaderboard('this-subreddit');
    }
  }

  showMenu() {
    this.hideAllScreens();
    this.menuScreen.classList.add('active');
    this.leaderboardRequested = false; // Reset leaderboard request flag
  }

  hideAllScreens() {
    this.menuScreen.classList.remove('active');
    this.gameScreen.classList.remove('active');
    this.gameOverScreen.classList.remove('active');
    this.leaderboardScreen.classList.remove('active');
    this.howToPlayModal.classList.remove('active');
  }

  showHowToPlay() {
    if (this.howToPlayModal) {
      this.howToPlayModal.classList.add('active');
    }
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.updateUI();
      if (this.timeLeft <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  handleWordSubmit() {
    if (!this.gameActive) return;

    const word = this.wordInputEl.value.trim();
    
    // Validate the word
    if (!this.validateWord(word)) {
      return;
    }

    try {
      window.parent.postMessage({
        type: 'wordSubmission',
        data: {
          word,
          chain: this.chain,
          score: this.score,
          combo: this.combo,
          topic: this.currentTopic,
        }
      }, '*');
      
      this.wordInputEl.value = '';
      
    } catch (error) {
      console.error('Error submitting word:', error);
      this.showMessage('Error submitting word', 'error');
    }
  }

  validateWord(word) {
    word = word.trim().toLowerCase();
    
    // Check if word is empty
    if (!word) {
      this.showMessage('Please enter a word', 'error');
      return false;
    }

    // Check if word has already been used
    if (this.chain.some(w => w.toLowerCase() === word)) {
      this.showMessage('This word has already been used!', 'error');
      return false;
    }

    // Check if it's the first word
    if (this.chain.length === 0) {
      return true;
    }

    // Get the last word in the chain
    const lastWord = this.chain[this.chain.length - 1].toLowerCase();
    
    // Check if the word starts with the last letter of the previous word
    if (word[0] !== lastWord[lastWord.length - 1]) {
      this.showMessage('Word must start with the last letter of the previous word', 'error');
      return false;
    }

    return true;
  }

  handleWordConfirmation(data) {
    if (!data) return;
  
    const { word, chain, score, combo, topic, validation } = data;
  
    // Re-enable input first
    if (this.wordInputEl) {
      this.wordInputEl.disabled = false;
    }
    if (this.submitBtn) {
      this.submitBtn.disabled = false;
    }
  
    // Show validation message
    if (validation) {
      const messageType = validation.isValid ? 'success' : 'error';
      let message = validation.reason || (validation.isValid ? 'Valid word!' : 'Invalid word');
    
      // Add score information to message
      const points = validation.score || 0;
      if (validation.isValid) {
        message = `${message} (+${points} points)`;
      } else {
        message = `${message} (${points} points)`; // Points will already be negative
      }
    
      this.showMessage(message, messageType);
    }
  
    // Update game state
    if (typeof score === 'number' && !isNaN(score)) {
      this.score = Math.max(0, score); // Prevent negative scores
      this.scoreEl.textContent = `${this.score}`;
    }
  
    if (typeof combo === 'number' && !isNaN(combo)) {
      this.combo = combo;
      this.comboEl.textContent = `${this.combo}x`;
    }
  
    // Update chain only for valid words
    if (validation?.isValid && Array.isArray(chain)) {
      this.chain = chain;
      this.updateChainDisplay();
    }
  
    // Update topic if provided
    if (topic && topic !== this.currentTopic && !this.isDailyChallenge) {
      this.currentTopic = topic;
      if (this.currentTopicEl) {
        this.currentTopicEl.textContent = this.currentTopic;
      }
    }
  
    if (this.wordInputEl) {
      this.wordInputEl.value = '';
      this.wordInputEl.focus();
    }
  }

  getGameOverMessage(score, username) {
    if (score === 0) {
      return `Oops! Even autocorrect can't help here ${username}! 😅`;
    } else if (score > this.highestScore && this.highestScore > 0) {
      return `Warning: Brain expansion detected ${username}! 🧠`;
    } else {
      return `Not bad, word warrior ${username}! 🗡️`;
    }
  }

  endGame() {
    clearInterval(this.timer);
    this.gameActive = false;
    // Update highest score if current score is higher
    if (this.score > this.highestScore) {
      this.highestScore = this.score;
    }
    // Show game over screen
    this.hideAllScreens();
    this.gameOverScreen.classList.add('active');
    if (this.finalScoreEl) {
      this.finalScoreEl.textContent = this.score;
    }
    // Update game over message
    const gameOverMessageEl = document.getElementById('game-over-message');
    if (gameOverMessageEl) {
      gameOverMessageEl.textContent = this.getGameOverMessage(this.score, this.username);
    }
    
    // Submit score to leaderboard
    window.parent.postMessage({
      type: 'submitScore',
      data: {
        score: this.score,
        playerName: this.username,
        t2: this.t2,
        t3: this.t3,
        subreddit: this.subredditName,
        isDaily: this.isDailyChallenge
      }
    }, '*');
    
    // Fetch all leaderboard tabs
    const tabs = ['this-subreddit', 'all-subreddits', 'daily-challenge'];
    tabs.forEach(tab => this.fetchLeaderboard(tab));
  }

  resetGame() {
    this.isDailyChallenge = false;
    this.gameActive = false;
    this.score = 0;
    this.combo = 1;
    this.timeLeft = 60;
    this.chain = [];
    this.chainContainerEl.innerHTML = '';
    
    // Update button visibility for normal game mode
    this.updateButtonVisibility();
    
    // Show menu screen
    this.hideAllScreens();
    this.menuScreen.classList.add('active');
  }

  updateUI() {
    if (this.scoreEl) this.scoreEl.textContent = this.score.toString();
    if (this.comboEl) this.comboEl.textContent = `${this.combo}x`;
    if (this.timeLeftEl) this.timeLeftEl.textContent = this.timeLeft.toString();
    if (this.currentTopicEl && this.currentTopic) {
      this.currentTopicEl.textContent = this.currentTopic;
    }

    // Enable or disable hint and skip buttons based on score
    const hintButton = document.getElementById('hint-btn');
    const skipButton = document.getElementById('skip-btn');

    if (this.score >= 10) {
      hintButton.disabled = false;
    } else {
      hintButton.disabled = true;
    }

    if (this.score >= 10 && !this.isDailyChallenge) {
      skipButton.disabled = false;
    } else {
      skipButton.disabled = true;
    }
  }

  updateChainDisplay() {
    this.chainContainerEl.innerHTML = '';
    this.chain.forEach(word => this.addWordToChain(word));
  }

  showGameOver(score, avatarUrl) {
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreElement = document.getElementById('final-score');
    const avatarElement = document.getElementById('player-snoovatar');
  
    if (finalScoreElement) {
      finalScoreElement.textContent = score;
    }
  
    if (avatarElement && avatarUrl) {
      avatarElement.src = avatarUrl;
      avatarElement.style.display = 'block';
    } else if (avatarElement) {
      avatarElement.style.display = 'none';
    }
  
    gameOverScreen.classList.add('active');
  }

  addWordToChain(word) {
    if (!this.chainContainerEl) return;
    const wordEl = document.createElement('span');
    wordEl.className = 'chain-word chalk-text chalk-white fade-in';
    const firstLetter = document.createElement('span');
    firstLetter.className = 'first-letter';
    firstLetter.textContent = word[0];
    const middlePart = document.createElement('span');
    middlePart.textContent = word.slice(1, -1);
    const lastLetter = document.createElement('span');
    lastLetter.className = 'last-letter';
    lastLetter.textContent = word[word.length - 1];
    wordEl.appendChild(firstLetter);
    if (middlePart.textContent) wordEl.appendChild(middlePart);
    wordEl.appendChild(lastLetter);
    const containerWidth = this.chainContainerEl.offsetWidth;
    const words = Array.from(this.chainContainerEl.children);
    let totalWidth = words.reduce((sum, el) => sum + el.offsetWidth + 5, 0) + wordEl.offsetWidth;
    if (totalWidth > containerWidth * 0.9) { 
      let widthFromRight = wordEl.offsetWidth;
      let wordsToKeep = [];
      for (let i = words.length - 1; i >= 0; i--) {
        widthFromRight += words[i].offsetWidth + 5;
        if (widthFromRight > containerWidth * 0.8) break;
        wordsToKeep.unshift(words[i]);
      }
      words.forEach(word => {
        if (!wordsToKeep.includes(word)) {
          word.classList.add('fade-out');
          setTimeout(() => word.remove(), 300);
        }
      });
    }
    this.chainContainerEl.appendChild(wordEl);
  }

  showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message chalk-text chalk-red';
    errorEl.textContent = message;
    document.body.appendChild(errorEl);
    setTimeout(() => errorEl.remove(), 2000);
  }

  showMessage(text, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        pointer-events: none;
      `;
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
      padding: 12px 24px;
      margin-bottom: 10px;
      border-radius: 4px;
      background-color: white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      pointer-events: none;
      font-family: 'Chawp', cursive;
      font-size: 1.2em;
      text-align: center;
      min-width: 200px;
    `;
    switch (type) {
      case 'success':
        toast.style.backgroundColor = '#4CAF50';
        toast.style.color = 'white';
        break;
      case 'error':
        toast.style.backgroundColor = '#f44336';
        toast.style.color = 'white';
        break;
      default:
        toast.style.backgroundColor = '#2196F3';
        toast.style.color = 'white';
    }
    toast.textContent = text;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toastContainer.contains(toast)) {
          toastContainer.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  handleDailyChallenge() {
    const now = new Date();
    
    if (this.lastDailyChallengeDate && 
        this.lastDailyChallengeDate.toDateString() === now.toDateString()) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const timeUntilNext = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
      
      this.showMessage(
        `You've already played today's challenge! Next challenge available in ${hours}h ${minutes}m`, 
        'info'
      );
      return;
    }
    
    window.parent.postMessage({
      type: 'startDailyChallenge'
    }, '*');
    
    this.lastDailyChallengeDate = now;
    localStorage.setItem('lastDailyChallengeDate', now.toISOString());
    
    this.startGame(true);
    
    this.updateDailyChallengeButton();
  }

  updateDailyChallengeTimer() {
    if (!this.nextDailyChallengeTime) return;
    
    const now = new Date();
    const timeUntilNext = this.nextDailyChallengeTime.getTime() - now.getTime();
    
    if (timeUntilNext <= 0) {
      this.lastDailyChallengeDate = null;
      this.nextDailyChallengeTime = null;
      localStorage.removeItem('lastDailyChallengeDate'); 
      this.updateDailyChallengeButton();
      return;
    }

    const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeUntilNext % (1000 * 60)) / 1000);

    const dailyChallengeBtn = document.getElementById('daily-challenge-btn');
    if (dailyChallengeBtn) {
      dailyChallengeBtn.textContent = `Next Challenge in ${hours}h ${minutes}m ${seconds}s`;
    }

    setTimeout(() => this.updateDailyChallengeTimer(), 1000);
  }

  updateDailyChallengeButton() {
    const dailyChallengeBtn = document.getElementById('daily-challenge-btn');
    if (!dailyChallengeBtn) return;

    const now = new Date();
    
    if (this.lastDailyChallengeDate && 
        this.lastDailyChallengeDate.toDateString() === now.toDateString()) {
      dailyChallengeBtn.disabled = true;
      
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const timeUntilNext = tomorrow.getTime() - now.getTime();
      this.nextDailyChallengeTime = tomorrow;
      
      this.updateDailyChallengeTimer();
    } else {
      dailyChallengeBtn.disabled = false;
      dailyChallengeBtn.textContent = 'Daily Challenge';
    }
  }

  provideHint() {
    if (this.score < 10) {
      this.showMessage('You need at least 10 points to get a hint!', 'error');
      return;
    }

    if (this.chain.length === 0) {
      this.showMessage('Play a word first to get a hint!', 'error');
      return;
    }

    const lastWord = this.chain[this.chain.length - 1];
    const lastLetter = lastWord.slice(-1).toLowerCase();

    const currentTopicWords = this.topicWords;

    const validWords = currentTopicWords.filter(word => {
      word = word.toLowerCase();
      return word[0] === lastLetter && !this.chain.includes(word);
    });

    if (validWords.length === 0) {
      this.showMessage('No hints available!', 'error');
      return;
    }

    this.score = Math.max(0, this.score - 10);
    this.scoreEl.textContent = `${this.score}`;

    const hint = validWords[Math.floor(Math.random() * validWords.length)];
    this.showMessage(`Try a word that starts with "${lastLetter}" like "${hint}"`, 'info');
  }

  skipTopic() {
    if (this.score < 10 || this.isDailyChallenge) return;
    
    this.score -= 10;
    const newTopic = this.getNextTopic();
    if (newTopic) {
      this.currentTopic = newTopic;
      this.topicWords = [];
      
      this.currentTopicEl.textContent = this.currentTopic;
      this.chain = [];
      this.updateUI();
      
      this.requestTopicWords(newTopic);
      
      this.showMessage(`Topic changed to: ${newTopic}`, 'info');
    }
  }

  getNextTopic() {
    const currentTopicIndex = this.topics.findIndex(topic => 
      (typeof topic === 'string' ? topic : topic.topic) === this.currentTopic
    );
    const nextTopicIndex = (currentTopicIndex + 1) % this.topics.length;
    const nextTopic = this.topics[nextTopicIndex];
    return typeof nextTopic === 'string' ? nextTopic : nextTopic.topic;
  }

  getWordsForTopic(topic) {
    const topicData = this.topics.find(t => t.topic === topic);
    return topicData ? topicData.words : [];
  }
 }

 document.addEventListener('DOMContentLoaded', () => {
  new WordLinkGame();
 });