export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
export const emptyState = (title, description = '') => `<div class="state state--empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
export const errorState = message => `<div class="state state--error"><strong>Không thể tải dữ liệu</strong><span>${escapeHtml(message)}</span></div>`;
