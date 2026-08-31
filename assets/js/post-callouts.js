(function () {
  const calloutTypes = {
    note: "note",
    warning: "warning",
    disclaimer: "disclaimer"
  };

  document.querySelectorAll(".post-content > p").forEach(function (paragraph) {
    const match = paragraph.textContent.trimStart().match(/^(Note|Warning|Disclaimer):(?=\s|$)/i);

    if (!match) return;

    const label = match[1].toLowerCase();
    const type = calloutTypes[label];
    const textNodes = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let textNode;

    while ((textNode = textNodes.nextNode())) {
      if (!textNode.nodeValue.trim()) continue;

      textNode.nodeValue = textNode.nodeValue.replace(
        /^\s*(Note|Warning|Disclaimer):\s*/i,
        ""
      );
      break;
    }

    paragraph.classList.add("post-callout", "post-callout--" + type);
    paragraph.dataset.calloutLabel = label.charAt(0).toUpperCase() + label.slice(1);
    paragraph.setAttribute("role", "note");
  });
})();
