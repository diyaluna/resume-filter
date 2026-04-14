(function() {
  // PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  // DOM Elements
  const jobInput = document.getElementById('jobDescInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const fileListDiv = document.getElementById('fileList');
  const analyzeAllBtn = document.getElementById('analyzeAllBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusMsg = document.getElementById('statusMessage');
  const resultsSection = document.getElementById('resultsSection');
  const resultsBody = document.getElementById('resultsBody');
  const modal = document.getElementById('resumeModal');
  const modalText = document.getElementById('modalResumeText');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // State
  let selectedFiles = [];
  const extractedTexts = new Map();
  let isAnalyzing = false; // prevent double clicks

  const commonNonSkills = new Set([
    'years','year','month','experience','work','project','team','company',
    'include','including','etc','eg','ie','ability','strong','knowledge',
    'familiar','proficient','skill','skillset','background','plus','minimum',
    'required','preferred','nice','have','looking','candidate','position',
    'role','responsibilities','duties','daily','basis','working','environment'
  ]);

  function isLikelySkill(word) {
    if (word.length <= 2) return false;
    if (commonNonSkills.has(word)) return false;
    return true;
  }

  function extractKeywords(text) {
    if (!text) return [];
    const stopWords = new Set(['a','an','the','and','or','but','for','with','in','on','at','to','of','is','are','was','were','be','been','have','has','had','do','does','did','we','you','they','i','me','my','your','their','our','this','that','these','those','from','by','as','not','can','will','would','should','could']);
    let tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w) && isNaN(w));
    const acronyms = text.match(/\b[A-Z]{2,6}\b/g) || [];
    acronyms.forEach(a => tokens.push(a.toLowerCase()));
    const unique = [...new Set(tokens)];
    return unique.filter(isLikelySkill);
  }

  function computeMatch(jobKeywords, resumeKeywords) {
    const resumeSet = new Set(resumeKeywords);
    const matched = jobKeywords.filter(kw => resumeSet.has(kw));
    const score = jobKeywords.length ? (matched.length / jobKeywords.length) * 100 : 0;
    return { score: Math.round(score), matched };
  }

  async function extractTextFromFile(file) {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      return await file.text();
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(' ') + ' ';
      }
      if (!fullText.trim()) throw new Error('No text found (scanned PDF?)');
      return fullText;
    }
    throw new Error('Unsupported file type');
  }

  function renderFileList() {
    fileListDiv.innerHTML = '';
    if (selectedFiles.length === 0) {
      fileListDiv.innerHTML = '<p style="color:#64748b;">No files selected</p>';
      return;
    }
    selectedFiles.forEach((file, index) => {
      const chip = document.createElement('span');
      chip.className = 'file-chip';
      chip.innerHTML = `<i class="far fa-file"></i> ${file.name} <span style="cursor:pointer;margin-left:8px;" data-index="${index}">&times;</span>`;
      fileListDiv.appendChild(chip);
    });
    // Use event delegation instead of attaching multiple listeners
  }

  // Handle removal via event delegation on the fileListDiv
  fileListDiv.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName === 'SPAN' && target.hasAttribute('data-index')) {
      const idx = parseInt(target.getAttribute('data-index'));
      if (!isNaN(idx) && idx >= 0 && idx < selectedFiles.length) {
        selectedFiles.splice(idx, 1);
        renderFileList();
      }
    }
  });

  function resetAll() {
    jobInput.value = '';
    selectedFiles = [];
    extractedTexts.clear();
    renderFileList();
    resultsSection.style.display = 'none';
    statusMsg.textContent = '';
    isAnalyzing = false;
  }

  function showModal(text) {
    modalText.textContent = text.slice(0, 5000) + (text.length > 5000 ? '\n\n... (truncated)' : '');
    modal.style.display = 'flex';
  }

  // --- Event Listeners (attached only once) ---
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length > 0) {
      selectedFiles = [...selectedFiles, ...newFiles];
      renderFileList();
    }
    fileInput.value = ''; // allow re-selecting same file
  });

  resetBtn.addEventListener('click', resetAll);

  closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  analyzeAllBtn.addEventListener('click', async () => {
    // Prevent multiple simultaneous analyses
    if (isAnalyzing) {
      statusMsg.textContent = 'Analysis already in progress...';
      return;
    }

    const jobText = jobInput.value.trim();
    if (!jobText) {
      alert('Please enter a job description.');
      return;
    }
    if (selectedFiles.length === 0) {
      alert('Please select at least one resume file.');
      return;
    }

    const jobKeywords = extractKeywords(jobText);
    if (jobKeywords.length === 0) {
      alert('No keywords found in job description. Try adding more specific skills.');
      return;
    }

    isAnalyzing = true;
    analyzeAllBtn.disabled = true;
    statusMsg.textContent = `Processing ${selectedFiles.length} file(s)...`;
    resultsSection.style.display = 'none';
    extractedTexts.clear();

    const results = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        statusMsg.textContent = `Processing ${i+1}/${selectedFiles.length}: ${file.name}`;
        const text = await extractTextFromFile(file);
        extractedTexts.set(file.name, text);
        const resumeKeywords = extractKeywords(text);
        const { score, matched } = computeMatch(jobKeywords, resumeKeywords);
        results.push({
          filename: file.name,
          score,
          matchedKeywords: matched.slice(0, 5),
          fullMatched: matched,
          text: text
        });
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        results.push({
          filename: file.name,
          score: 0,
          error: true,
          matchedKeywords: [],
          text: ''
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    // Render table
    resultsBody.innerHTML = '';
    results.forEach((res) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${res.filename} ${res.error ? '<span style="color:#dc2626;">(error)</span>' : ''}</td>
        <td><span class="score-badge">${res.score}%</span></td>
        <td>${res.matchedKeywords.join(', ') || '—'}</td>
        <td><button class="view-btn" data-filename="${res.filename.replace(/'/g, "\\'")}"><i class="far fa-file-alt"></i> View</button></td>
      `;
      resultsBody.appendChild(row);
    });

    // Attach view button listeners
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filename = e.currentTarget.dataset.filename;
        const text = extractedTexts.get(filename) || 'No text available.';
        showModal(text);
      });
    });

    const successCount = results.filter(r => !r.error).length;
    statusMsg.textContent = `✅ Analysis complete. ${successCount} of ${selectedFiles.length} files processed successfully.`;
    resultsSection.style.display = 'block';
    
    isAnalyzing = false;
    analyzeAllBtn.disabled = false;
  });

  // Initial render
  renderFileList();
})();
