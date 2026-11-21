/**
 * Wraps every word of an element in `<span class="word"><span class="word__inner">`
 * so headings can rise out of a mask without turning lines into a pile of divs.
 *
 * Text nodes are preserved for spacing (and for screen readers); inline
 * elements such as `<em>` keep their markup and get their words wrapped too.
 * Returns the inner spans, ready for a GSAP stagger.
 */
export function splitWords(root) {
  if (!root || root.dataset.split === 'done') return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  const inners = [];

  for (const node of textNodes) {
    if (!node.textContent.trim()) continue;
    const fragment = document.createDocumentFragment();
    const pieces = node.textContent.split(/(\s+)/);

    for (const piece of pieces) {
      if (!piece.trim()) {
        fragment.appendChild(document.createTextNode(piece));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'word';
      const inner = document.createElement('span');
      inner.className = 'word__inner';
      inner.textContent = piece;
      word.appendChild(inner);
      fragment.appendChild(word);
      inners.push(inner);
    }

    node.parentNode.replaceChild(fragment, node);
  }

  root.dataset.split = 'done';
  return inners;
}
