import { browser } from 'wxt/browser';
import './style.css';

const button = document.querySelector<HTMLButtonElement>('[data-open-workspace]')!;
const status = document.querySelector<HTMLElement>('[data-launch-status]')!;
let windowId: number | undefined;

// Resolve the window before the click so sidePanel.open keeps user activation.
void browser.windows.getCurrent().then((current) => {
  windowId = current.id;
  button.disabled = windowId === undefined || !browser.sidePanel?.open;
  if (button.disabled) status.textContent = '当前浏览器无法打开侧边栏，请使用支持侧边栏的 Chrome 或 Edge。';
}).catch(() => {
  status.textContent = '无法确认浏览器窗口，请重新打开扩展入口。';
});

button.addEventListener('click', () => {
  if (windowId === undefined || button.disabled) return;
  button.disabled = true;
  // A window-wide panel survives tab changes; never set a tab-specific panel.
  void browser.sidePanel.open({ windowId }).then(() => window.close()).catch(() => {
    button.disabled = false;
    status.textContent = '侧边栏未能打开，请重新点击。';
  });
});
