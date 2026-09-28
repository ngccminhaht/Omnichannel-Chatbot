import { escapeHtml } from '../ui/states.js';

export function pageHeader({ title, description, actions = '' }) {
  return `<div class="page-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="page-header-actions">${actions}</div></div>`;
}
