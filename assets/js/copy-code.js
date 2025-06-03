document.addEventListener('DOMContentLoaded', () => {
  // Try to target <pre> elements specifically within generated highlight divs if they exist,
  // or fall back to any <pre> tag within the post content.
  const codeBlocks = document.querySelectorAll('.post-content div.highlight > pre, .post-content > pre');

  codeBlocks.forEach(preElement => {
    const codeElement = preElement.querySelector('code');
    if (!codeElement) {
      // If a <pre> doesn't directly contain <code>, it might be the <pre> from div.highlight
      // and the actual code is deeper. This selector is quite specific to Rouge's output.
      // If it's not found, this pre element might not be a syntax-highlighted block.
      return; 
    }

    const button = document.createElement('button');
    button.className = 'copy-button';
    button.setAttribute('aria-label', 'Copy code to clipboard');
    button.innerHTML = '📋'; // Clipboard symbol as label

    // Prepend the button to the <pre> element.
    // The CSS handles positioning it to the top-right.
    preElement.insertBefore(button, preElement.firstChild);

    button.addEventListener('click', async () => {
      const originalText = button.innerHTML;
      const originalAriaLabel = button.getAttribute('aria-label');
      try {
        await navigator.clipboard.writeText(codeElement.innerText);
        button.innerHTML = '✅'; // Checkmark symbol for copied
        button.setAttribute('aria-label', 'Copied to clipboard!');
        
        // Add a class for potential "copied" state styling in CSS
        button.classList.add('copied'); 

        setTimeout(() => {
          button.innerHTML = originalText;
          button.setAttribute('aria-label', originalAriaLabel);
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
        button.innerHTML = '❌'; // X symbol for error
        button.setAttribute('aria-label', 'Failed to copy');
        setTimeout(() => {
          button.innerHTML = originalText;
          button.setAttribute('aria-label', originalAriaLabel);
        }, 2000);
      }
    });
  });
}); 