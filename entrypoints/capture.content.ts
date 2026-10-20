// Runs in the page's own JavaScript world, before the console's code, and only
// listens: when the console loads chart data in the background (a batchexecute
// call, e.g. after choosing a longer date range), it hands a copy of the
// response to the widget so Extract can save it. It sends nothing anywhere
// and changes no request. Messages carry a fixed tag; the widget checks it.
export default defineContentScript({
  matches: ['https://chrome.google.com/webstore/devconsole/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const TAG = 'cwsagent:rpc';
    const isRpc = (url: string) => url.includes('/batchexecute');
    const post = (text: string) => window.postMessage({ type: TAG, text }, location.origin);

    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __cwsUrl?: string }, method: string, url: string | URL, ...rest: unknown[]) {
      this.__cwsUrl = String(url);
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __cwsUrl?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
      if (isRpc(this.__cwsUrl ?? '')) {
        this.addEventListener('load', () => {
          if (this.responseType === '' || this.responseType === 'text') post(this.responseText);
        });
      }
      return send.call(this, body);
    };

    const fetchFn = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const res = await fetchFn.call(this, input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (isRpc(url)) res.clone().text().then(post, () => {});
      return res;
    };
  },
});
