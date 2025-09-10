/* global PaxiCosmJS, toastr, bootstrap */

let CONFIG = { rpc: "", lcd: "", denom: "upaxi", swapModuleAddress: "" };
let currentSlip = 0.005;
let cachedAddress = null;
let lastQuote = null;
let selectedToken = null; // {name,symbol,decimals,contract}

const $ = (s) => document.querySelector(s);
const resultBox = $("#result");
const historyBox = $("#history");
const addrLabel = $("#addr-label");
const tokenModal = new bootstrap.Modal("#tokenModal", { backdrop: "static" });
const confirmModal = new bootstrap.Modal("#confirmModal", { backdrop: "static" });

function logResult(obj) {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  resultBox.textContent = text;
}
function pushHistory(item) {
  const li = document.createElement("li");
  li.innerHTML = `<i class="fa-solid fa-circle-check text-success me-1"></i> ${item}`;
  historyBox.prepend(li);
}
function setThemeToggle() {
  const btn = $("#btn-theme");
  const saved = localStorage.getItem("theme") || "dark";
  const isDark = saved === "dark";
  document.documentElement.classList.toggle("light", !isDark);
  btn.innerHTML = isDark ? `<i class="fa-solid fa-moon"></i>` : `<i class="fa-solid fa-sun"></i>`;
  btn.addEventListener("click", () => {
    const nowDark = !document.documentElement.classList.contains("light");
    document.documentElement.classList.toggle("light", nowDark);
    const newMode = document.documentElement.classList.contains("light") ? "light" : "dark";
    localStorage.setItem("theme", newMode);
    btn.innerHTML = newMode === "dark" ? `<i class="fa-solid fa-moon"></i>` : `<i class="fa-solid fa-sun"></i>`;
  });
}
setThemeToggle();
$("#year").textContent = new Date().getFullYear();

toastr.options = { closeButton: true, progressBar: true, newestOnTop: true, timeOut: 3000, positionClass: "toast-bottom-right" };

// Deep-link ke PaxiHub bila mobile & tak terinjeksi
(function ensurePaxiHub() {
  if (typeof window.paxihub === "undefined" && /Mobi/.test(navigator.userAgent)) {
    setTimeout(() => {
      window.location.href = `paxi://hub/explorer?url=${encodeURIComponent(window.location.href)}`;
    }, 300);
  }
})();

// config
(async function loadConfig() {
  try {
    const r = await fetch("/api/config");
    CONFIG = await r.json();
    $("#stat-rpc").textContent = CONFIG.rpc;
    $("#stat-lcd").textContent = CONFIG.lcd;
  } catch (e) { console.error(e); }
})();

// Slippage buttons
document.querySelectorAll(".btn-slip").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".btn-slip").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    currentSlip = Number(b.dataset.slip);
    if (lastQuote) updateImpact(lastQuote.priceImpact);
  });
});

// Token modal
$("#btn-select-token").addEventListener("click", openTokenModal);
async function openTokenModal() {
  try {
    const list = await fetch("/tokens.json").then(r => r.json()).catch(() => []);
    const ul = $("#token-list");
    const search = $("#search-token");
    function render(filter="") {
      ul.innerHTML = "";
      list
        .filter(t => {
          const q = filter.toLowerCase();
          return (
            t.name?.toLowerCase().includes(q) ||
            t.symbol?.toLowerCase().includes(q) ||
            t.contract?.toLowerCase().includes(q)
          );
        })
        .forEach(t => {
          const li = document.createElement("li");
          li.className = "list-group-item d-flex justify-content-between align-items-center";
          li.innerHTML = `
            <div>
              <div class="fw-bold">${t.name} <span class="badge bg-secondary">${t.symbol}</span></div>
              <div class="mono small opacity-75">${t.contract}</div>
            </div>
            <button class="btn btn-sm btn-primary"><i class="fa-solid fa-check"></i></button>`;
          li.querySelector("button").addEventListener("click", () => {
            applySelectedToken(t);
            tokenModal.hide();
          });
          ul.appendChild(li);
        });
      if (!ul.children.length) {
        const empty = document.createElement("li");
        empty.className = "list-group-item";
        empty.textContent = "Tidak ada hasil.";
        ul.appendChild(empty);
      }
    }
    render();
    search.oninput = (e) => render(e.target.value);
    tokenModal.show();
  } catch (e) {
    toastr.error("Gagal membuka daftar token");
  }
}
function applySelectedToken(t) {
  selectedToken = { ...t };
  $("#inp-contract").value = t.contract;
  $("#inp-symbol").value = t.symbol || "—";
  $("#inp-decimals").value = t.decimals ?? "—";
  toastr.success(`Dipilih: ${t.symbol || t.name}`);
}

// Auto metadata saat kontrak diubah
$("#inp-contract").addEventListener("change", async () => {
  const c = $("#inp-contract").value.trim();
  if (!c) return;
  try {
    const info = await fetch(`/api/token?contract=${encodeURIComponent(c)}`).then(r => r.json());
    if (info.error) throw new Error(info.error);
    selectedToken = { ...info, contract: c };
    $("#inp-symbol").value = info.symbol || "—";
    $("#inp-decimals").value = info.decimals ?? "—";
    toastr.info(`Token terdeteksi: ${info.symbol || info.name || "?"}`);
  } catch (e) {
    toastr.warning("Gagal ambil metadata token");
  }
});

// Price Impact UI
function updateImpact(impactPercent) {
  const abs = Math.min(Math.max(Math.abs(impactPercent), 0), 50);
  const bar = $("#bar-impact");
  const lbl = $("#lbl-impact");
  bar.style.width = `${abs}%`;
  lbl.textContent = isFinite(impactPercent) ? `${impactPercent.toFixed(2)}%` : "—";
  bar.classList.remove("bg-success", "bg-warning", "bg-danger");
  if (abs < 1) bar.classList.add("bg-success");
  else if (abs < 5) bar.classList.add("bg-warning");
  else bar.classList.add("bg-danger");
}

// Connect
$("#btn-connect").addEventListener("click", async () => {
  try {
    if (!window.paxihub || !window.paxihub.paxi?.getAddress) {
      toastr.error("PaxiHub tidak terdeteksi. Buka di PaxiHub Browser.");
      return;
    }
    const addr = await window.paxihub.paxi.getAddress();
    cachedAddress = addr.address;
    addrLabel.textContent = cachedAddress;
    addrLabel.title = cachedAddress;
    toastr.success("Wallet connected!");
  } catch (e) {
    toastr.error(e.message || "Gagal connect wallet");
  }
});

// Quote
$("#btn-quote").addEventListener("click", handleQuote);
async function handleQuote() {
  try {
    const contract = $("#inp-contract").value.trim();
    const amount = Number($("#inp-amount").value);
    if (!contract || !amount) return toastr.warning("Isi kontrak & jumlah.");

    const q = await fetch(`/api/quote?contract=${encodeURIComponent(contract)}&amount=${amount}`).then(r=>r.json());
    if (q.error) throw new Error(q.error);
    lastQuote = q;

    const minReceive = Math.floor(q.expectedOut * (1 - currentSlip));
    logResult({
      reservePaxi: q.reservePaxi,
      reservePrc20: q.reservePrc20,
      expectedOut: q.expectedOut,
      slippage: currentSlip,
      minReceive,
      priceImpact: q.priceImpact
    });
    updateImpact(q.priceImpact);
    toastr.info("Quote diperbarui.");
  } catch (e) {
    toastr.error(e.message || "Gagal ambil quote");
  }
}

// Swap → Confirm modal
let pendingSwap = null;
$("#btn-swap").addEventListener("click", async () => {
  try {
    if (!cachedAddress) return toastr.warning("Silakan connect wallet dulu.");
    const contract = $("#inp-contract").value.trim();
    const amount = Number($("#inp-amount").value);
    if (!contract || !amount) return toastr.warning("Isi kontrak & jumlah.");

    if (!lastQuote || !isFinite(lastQuote.expectedOut)) {
      await handleQuote();
      if (!lastQuote) return;
    }
    const decimals = Number($("#inp-decimals").value) || selectedToken?.decimals || 0;
    const symbol = $("#inp-symbol").value || selectedToken?.symbol || "PRC20";
    const minReceive = Math.floor(lastQuote.expectedOut * (1 - currentSlip));

    const summary = {
      from: { symbol, amount, raw: amount, decimals },
      to:   { symbol: "PAXI", amount: lastQuote.expectedOut, minReceive, denom: CONFIG.denom },
      priceImpact: lastQuote.priceImpact,
      slippage: currentSlip
    };
    pendingSwap = { contract, amount, minReceive, summary };
    $("#confirm-summary").textContent = JSON.stringify(summary, null, 2);
    confirmModal.show();
  } catch (e) {
    toastr.error(e.message || "Tidak bisa mempersiapkan swap");
  }
});

$("#btn-confirm-swap").addEventListener("click", async () => {
  if (!pendingSwap) return;
  confirmModal.hide();
  await doSwap(pendingSwap.contract, pendingSwap.amount, pendingSwap.minReceive).catch(e => {
    toastr.error(e.message || "Gagal swap");
  });
});

// TX builder & signer (via PaxiHub) + broadcast ke /api/broadcast
async function doSwap(prc20, offerAmount, minReceive) {
  const sender = cachedAddress;
  const spender = CONFIG.swapModuleAddress;

  // 1) Allowance
  const allowanceMsg = { increase_allowance: { spender, amount: String(offerAmount) } };
  const execAllowance = PaxiCosmJS.MsgExecuteContract.fromPartial({
    sender, contract: prc20,
    msg: new TextEncoder().encode(JSON.stringify(allowanceMsg))
  });
  const anyAllowance = PaxiCosmJS.Any.fromPartial({
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: PaxiCosmJS.MsgExecuteContract.encode(execAllowance).finish()
  });

  // 2) MsgSwap
  const swapMsg = {
    creator: sender,
    prc20,
    offerDenom: prc20,
    offerAmount: String(offerAmount),
    minReceive: String(minReceive)
  };
  const swapExec = PaxiCosmJS.MsgSwap.fromPartial(swapMsg);
  const anySwap = PaxiCosmJS.Any.fromPartial({
    typeUrl: "/x.swap.types.MsgSwap",
    value: PaxiCosmJS.MsgSwap.encode(swapExec).finish()
  });

  const messages = [anyAllowance, anySwap];

  // Fetch chain/account
  const chainId = await fetch(`${CONFIG.rpc}/status`).then(r=>r.json()).then(d=>d.result.node_info.network);
  const acc = await fetch(`${CONFIG.lcd}/cosmos/auth/v1beta1/accounts/${sender}`).then(r=>r.json());
  const ba = acc.account.base_account || acc.account;
  const accountNumber = Number(ba.account_number);
  const sequence = Number(ba.sequence);

  const txBody = PaxiCosmJS.TxBody.fromPartial({ messages, memo: `Swap PRC20->PAXI` });
  const fee = { amount: [ PaxiCosmJS.coins("30000", CONFIG.denom)[0] ], gasLimit: 600000 };

  const walletInfo = await window.paxihub.paxi.getAddress();
  const pubkeyBytes = new Uint8Array(walletInfo.public_key);
  const pubkeyAny = { typeUrl: "/cosmos.crypto.secp256k1.PubKey", value: PaxiCosmJS.PubKey.encode({ key: pubkeyBytes }).finish() };

  const authInfo = PaxiCosmJS.AuthInfo.fromPartial({
    signerInfos: [{ publicKey: pubkeyAny, modeInfo: { single: { mode: 1 } }, sequence: BigInt(sequence) }],
    fee
  });

  const signDoc = PaxiCosmJS.SignDoc.fromPartial({
    bodyBytes: PaxiCosmJS.TxBody.encode(txBody).finish(),
    authInfoBytes: PaxiCosmJS.AuthInfo.encode(authInfo).finish(),
    chainId,
    accountNumber: BigInt(accountNumber)
  });

  const txObj = {
    bodyBytes: btoa(String.fromCharCode(...signDoc.bodyBytes)),
    authInfoBytes: btoa(String.fromCharCode(...signDoc.authInfoBytes)),
    chainId, accountNumber: signDoc.accountNumber.toString()
  };

  toastr.info("Minta tanda tangan di PaxiHub…");
  const signed = await window.paxihub.paxi.signAndSendTransaction(txObj);

  const sigBytes = Uint8Array.from(atob(signed.success), c => c.charCodeAt(0));
  const txRaw = PaxiCosmJS.TxRaw.fromPartial({
    bodyBytes: signDoc.bodyBytes,
    authInfoBytes: signDoc.authInfoBytes,
    signatures: [sigBytes]
  });
  const txBytes = PaxiCosmJS.TxRaw.encode(txRaw).finish();
  const base64Tx = btoa(String.fromCharCode(...txBytes));

  const broadcast = await fetch("/api/broadcast", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ tx_bytes: base64Tx, mode: "BROADCAST_MODE_SYNC" })
  }).then(r=>r.json());

  logResult(broadcast);
  if (broadcast?.tx_response?.txhash) {
    pushHistory(`Swap submitted · Tx: ${broadcast.tx_response.txhash}`);
    toastr.success("Swap dikirim!");
  } else {
    toastr.warning("Broadcast selesai, cek detail di result.");
  }
}
