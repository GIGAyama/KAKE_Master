/*
 * インストールの合図を、いちばん先に受け取るためだけの小さなファイル。
 *
 * Chrome は条件が揃うと即座に beforeinstallprompt を出す。
 * これを本体（type="module" の app.js。実行はページの解析後）で待つと、
 * 通信が遅い端末では合図が先に飛んでしまい、「インストール」ボタンが出なくなる。
 *
 * CSP の script-src に 'unsafe-inline' を足さずに済むよう、
 * インラインではなく外部ファイルにして <head> の先頭で同期読み込みする。
 */
(function () {
  window.__pwaInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-install-available'));
  });

  window.addEventListener('appinstalled', function () {
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
})();
