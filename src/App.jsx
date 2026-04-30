import React, { useState, useRef, useCallback, useEffect } from "react";

const SK = "sapin_v7";
const AK = "sapin_arch_v7";
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const todayISO = () => new Date().toISOString().slice(0, 10);
const slotMin = (t) => { if (!t) return 9999; const p = t.split(":").map(Number); return p[0] * 60 + (p[1] || 0); };
const TIMES = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const WDAYS = ["L","M","M","J","V","S","D"];

function fmtDT(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso) {
  const t = todayISO();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  const tomISO = tom.toISOString().slice(0, 10);
  if (iso === t) return "Aujourd'hui";
  if (iso === tomISO) return "Demain";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDay(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

function openWaze(address, cp, city) {
  const q = encodeURIComponent(address + " " + cp + " " + city + " France");
  window.open("https://waze.com/ul?q=" + q + "&navigate=yes", "_blank");
}
function openGMaps(address, cp, city) {
  const q = encodeURIComponent(address + " " + cp + " " + city + " France");
  window.open("https://www.google.com/maps/dir/?api=1&destination=" + q, "_blank");
}
function openGMapsRoute(deliveries) {
  if (!deliveries.length) return;
  const waypoints = deliveries.slice(0, -1).map((d) => encodeURIComponent(d.adresse + " " + d.codePostal + " " + d.ville)).join("|");
  const dest = encodeURIComponent(deliveries[deliveries.length - 1].adresse + " " + deliveries[deliveries.length - 1].codePostal + " " + deliveries[deliveries.length - 1].ville);
  let url = "https://www.google.com/maps/dir/?api=1&destination=" + dest;
  if (waypoints) url += "&waypoints=" + waypoints;
  window.open(url, "_blank");
}

async function parseSlip(b64, mime) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: 'Analyse ce bon de livraison sapin. UNIQUEMENT JSON valide, aucun texte autour.\n{"prenom":"string","nom":"string","adresse":"string","codePostal":"string","ville":"string","email":"string|null","telephone":"string|null","produit":"string","taille":"string","prix":0,"notes":"string|null"}\nNull si absent, 0 pour prix absent.' }
      ]}]
    })
  });
  const data = await r.json();
  const txt = (data.content || []).map((b) => b.text || "").join("");
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}

async function calcRoute(picks) {
  const lines = picks.map((d, i) => (i + 1) + ". " + d.prenom + " " + d.nom + " — " + d.adresse + ", " + d.codePostal + " " + d.ville + " | " + d.slotFrom + "-" + d.slotTo).join("\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: "Optimise ces livraisons de sapins en respectant les créneaux horaires.\n" + lines + '\nUNIQUEMENT JSON:\n{"ordre":[1,2,3],"tempsEstime":"2h30","distanceEstimee":"45 km","conseils":["conseil"]}' }]
    })
  });
  const data = await r.json();
  const txt = (data.content || []).map((b) => b.text || "").join("");
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}

function doExport(rows, filename) {
  const h = ["Date","Prénom","Nom","Adresse","CP","Ville","Tél","Email","Produit","Taille","Prix","Créneau","Enregistré"];
  const body = rows.map((d) => [d.deliveryDate, d.prenom, d.nom, d.adresse, d.codePostal, d.ville, d.telephone || "", d.email || "", d.produit, d.taille, d.prix, d.slotFrom + "-" + d.slotTo, fmtDT(d.createdAt)]);
  const csv = [h, ...body].map((row) => row.map((c) => '"' + String(c || "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
  a.download = filename; a.click();
}

const R = "#C0392B"; const RD = "#922B21"; const RL = "#FADBD8";
const G = "#1A7A3A"; const GD = "#145A2A"; const GL = "#D5F5E3";
const GO = "#D4AC0D"; const GOL = "#FEF9E7";
const BG = "#FBF8F5"; const MU = "#9A8080"; const TX = "#1A0A0A";

function Tag(props) {
  return (
    <span style={{ background: props.bg, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: props.c, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {props.children}
    </span>
  );
}

function Loader() {
  return <span style={{ display: "inline-block", width: 15, height: 15, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

function NavBtns(props) {
  const d = props.d;
  return (
    <div style={{ display: "flex", gap: 5 }}>
      <button className="btn" onClick={() => openWaze(d.adresse, d.codePostal, d.ville)}
        style={{ flex: 1, background: "#05C8F7", color: "#fff", borderRadius: 8, padding: "7px 4px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={{ fontSize: 14 }}>📱</span> Waze
      </button>
      <button className="btn" onClick={() => openGMaps(d.adresse, d.codePostal, d.ville)}
        style={{ flex: 1, background: "#4285F4", color: "#fff", borderRadius: 8, padding: "7px 4px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={{ fontSize: 14 }}>🗺️</span> Maps
      </button>
    </div>
  );
}

function BannerCard(props) {
  const d = props.d;
  const done = d.livree;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: done ? "#F9FEF9" : "#fff", borderRadius: 14, border: "1px solid " + (done ? GL : "rgba(0,0,0,.08)"), overflow: "hidden", opacity: done ? 0.75 : 1, animation: "bannerIn .3s ease " + ((props.index || 0) * 0.05) + "s both" }}>
      <div style={{ height: 4, background: done ? "linear-gradient(90deg," + G + ",#58D68D)" : "linear-gradient(90deg," + R + ",#F1948A)" }} />
      <div style={{ padding: "11px 13px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }} onClick={() => setOpen(!open)} >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 16 }}>🎄</span>
              <span style={{ fontWeight: 700, fontSize: 15, textDecoration: done ? "line-through" : "none", color: done ? MU : TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.prenom} {d.nom}
              </span>
              {done && <span style={{ background: GL, color: G, borderRadius: 5, padding: "1px 6px", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>LIVRÉ</span>}
            </div>
            <div style={{ fontSize: 11, color: MU, paddingLeft: 23, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              📍 {d.adresse}, {d.codePostal} {d.ville}
            </div>
          </div>
          {!props.readonly && (
            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              <button onClick={props.onEdit} style={{ background: "#FFF8E8", border: "none", borderRadius: 7, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✏️</button>
              <button onClick={props.onCheck} style={{ background: done ? RL : GL, border: "none", borderRadius: 7, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: done ? R : G, fontSize: 14 }}>✓</button>
              <button onClick={props.onDelete} style={{ background: "#FEF2F2", border: "none", borderRadius: 7, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: R, fontSize: 14 }}>✕</button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
          <Tag bg={RL} c={R}>🌲 {d.produit} {d.taille}</Tag>
          <Tag bg={GL} c={G}>{d.prix}€</Tag>
          <Tag bg={GOL} c={GO}>🕐 {d.slotFrom}–{d.slotTo}</Tag>
          {d.telephone && <Tag bg="#F0F0FF" c="#3040B8">📞 {d.telephone}</Tag>}
        </div>
        <NavBtns d={d} />
        {open && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#C8B0B0" }}>Enregistré le {fmtDT(d.createdAt)}</div>
        )}
      </div>
    </div>
  );
}

function CalGrid(props) {
  const { year, month, marked, selected, onSelect, onPrev, onNext } = props;
  const today = todayISO();
  const total = daysInMonth(year, month);
  const start = firstDay(year, month);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(year + "-" + mm + "-" + dd);
  }
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onPrev} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{MONTHS[month]} {year}</div>
        <button onClick={onNext} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "8px 8px 4px" }}>
        {WDAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: i >= 5 ? R : MU, padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 8px 10px", gap: 2 }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const isTod = iso === today;
          const isSel = iso === selected;
          const cnt = marked[iso] || 0;
          const isPast = iso < today;
          return (
            <button key={i} onClick={() => onSelect(iso === selected ? null : iso)}
              style={{ border: "none", borderRadius: 8, padding: "5px 2px", cursor: "pointer", background: isSel ? R : isTod ? RL : "transparent", color: isSel ? "#fff" : isTod ? R : isPast ? "#CCC" : TX, fontWeight: isTod || isSel ? 700 : 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .15s" }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{new Date(iso).getDate()}</span>
              {cnt > 0 && (
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: isSel ? "rgba(255,255,255,.35)" : G, color: "#fff", fontSize: 8, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── MAP TAB ───────────────────────────────────────────────────────────────────
function MapTab(props) {
  const { deliveries, archives } = props;
  const today = todayISO();
  const [mapDate, setMapDate] = useState(today);
  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeErr, setRouteErr] = useState(null);

  const grouped = [...deliveries, ...archives].reduce((acc, d) => {
    if (!acc[d.deliveryDate]) acc[d.deliveryDate] = [];
    acc[d.deliveryDate].push(d);
    return acc;
  }, {});

  const allDates = Object.keys(grouped).sort();
  const dayList = (grouped[mapDate] || []).slice().sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom));
  const pending = dayList.filter((d) => !d.livree);

  const orderedList = routeResult
    ? (routeResult.ordre || []).map((n) => pending[n - 1]).filter(Boolean)
    : pending;

  const handleCalcRoute = async () => {
    if (!pending.length) return;
    setRouteLoading(true); setRouteErr(null); setRouteResult(null);
    try {
      const r = await calcRoute(pending);
      setRouteResult(r);
    } catch (e) {
      setRouteErr("Erreur. Réessaie.");
    } finally {
      setRouteLoading(false);
    }
  };

  // Build OpenStreetMap iframe URL with all markers
  const buildMapUrl = () => {
    if (!dayList.length) return null;
    // Use OpenStreetMap with markers via uMap or just show the area
    // We'll use a custom approach with an HTML map
    return null;
  };

  return (
    <div className="fade">
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: R, marginBottom: 3 }}>Carte</h2>
      <p style={{ fontSize: 11, color: MU, marginBottom: 14 }}>Visualise et navigue vers tes livraisons</p>

      {/* Date selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MU, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Jour de livraison</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {allDates.length === 0 && (
            <div style={{ fontSize: 12, color: MU, padding: "8px 0" }}>Aucune livraison planifiée</div>
          )}
          {allDates.map((d) => {
            const cnt = (grouped[d] || []).length;
            const isToday = d === today;
            const isSel = d === mapDate;
            return (
              <button key={d} className="btn" onClick={() => { setMapDate(d); setRouteResult(null); }}
                style={{ flexShrink: 0, background: isSel ? R : isToday ? RL : "#fff", border: "1.5px solid " + (isSel ? R : isToday ? R : "rgba(0,0,0,.1)"), borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 62 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isSel ? "#fff" : isToday ? R : MU, textTransform: "capitalize" }}>
                  {new Date(d).toLocaleDateString("fr-FR", { weekday: "short" })}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: isSel ? "#fff" : isToday ? R : TX, lineHeight: 1.2 }}>
                  {new Date(d).getDate()}
                </div>
                <div style={{ fontSize: 9, color: isSel ? "rgba(255,255,255,.8)" : MU }}>
                  {new Date(d).toLocaleDateString("fr-FR", { month: "short" })}
                </div>
                <div style={{ marginTop: 3 }}>
                  <span style={{ background: isSel ? "rgba(255,255,255,.25)" : GL, color: isSel ? "#fff" : G, borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{cnt}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {dayList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#C8A8A8" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🗺️</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 5 }}>Aucune livraison ce jour</div>
        </div>
      ) : (
        <div>
          {/* Map embed - OpenStreetMap with all addresses */}
          <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,0,0,.1)", marginBottom: 14, position: "relative" }}>
            <iframe
              title="carte"
              width="100%"
              height="260"
              frameBorder="0"
              style={{ display: "block" }}
              src={"https://www.openstreetmap.org/export/embed.html?bbox=2.0,48.7,2.6,49.0&layer=mapnik&marker=" + dayList.map((d) => encodeURIComponent(d.adresse + " " + d.codePostal + " " + d.ville)).join(",")}
            />
            <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 6 }}>
              <button className="btn" onClick={() => openGMapsRoute(orderedList)}
                style={{ background: "#4285F4", color: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}>
                🗺️ Ouvrir dans Maps
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: RL, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: R }}>{dayList.length}</div>
              <div style={{ fontSize: 9, color: MU, marginTop: 1 }}>livraisons</div>
            </div>
            <div style={{ flex: 1, background: GL, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: G }}>{pending.length}</div>
              <div style={{ fontSize: 9, color: MU, marginTop: 1 }}>restantes</div>
            </div>
            <div style={{ flex: 1, background: GOL, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: GO }}>{dayList.reduce((s, d) => s + (d.prix || 0), 0)}€</div>
              <div style={{ fontSize: 9, color: MU, marginTop: 1 }}>CA du jour</div>
            </div>
          </div>

          {/* Itinéraire IA */}
          {pending.length > 0 && (
            <button className="btn" onClick={handleCalcRoute}
              style={{ width: "100%", background: routeResult ? GL : "linear-gradient(135deg," + G + "," + GD + ")", border: routeResult ? "1.5px solid " + G : "none", color: routeResult ? G : "#fff", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {routeLoading ? <Loader /> : routeResult ? "✓ Itinéraire calculé — recalculer" : "🧠 Calculer l'itinéraire optimal (IA)"}
            </button>
          )}

          {routeErr && <div style={{ background: "#FEF2F2", border: "1px solid " + RL, borderRadius: 9, padding: 10, color: R, fontSize: 12, marginBottom: 10 }}>⚠️ {routeErr}</div>}

          {routeResult && (
            <div style={{ background: "#F0F5FF", border: "1px solid #C0CCFF", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3040B8" }}>⏱ {routeResult.tempsEstime}</span>
                <span style={{ color: "#A0A8D8" }}>·</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3040B8" }}>🚗 {routeResult.distanceEstimee}</span>
              </div>
              {(routeResult.conseils || []).map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: "#5060A0", marginBottom: 2 }}>💡 {c}</div>
              ))}
              {/* Open full route in Maps */}
              <button className="btn" onClick={() => openGMapsRoute(orderedList)}
                style={{ marginTop: 10, width: "100%", background: "#4285F4", color: "#fff", borderRadius: 9, padding: "10px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🗺️ Ouvrir l'itinéraire complet dans Google Maps
              </button>
            </div>
          )}

          {/* List ordered */}
          <div style={{ fontSize: 10, fontWeight: 700, color: MU, textTransform: "uppercase", letterSpacing: 1, marginBottom: 9 }}>
            {routeResult ? "Ordre de livraison optimisé" : "Livraisons du jour"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orderedList.map((d, i) => (
              <div key={d.id} style={{ background: "#fff", borderRadius: 13, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden" }}>
                <div style={{ height: 3, background: "linear-gradient(90deg," + R + "," + G + ")" }} />
                <div style={{ padding: "12px 13px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", color: "#fff", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                      {routeResult ? i + 1 : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 11, color: MU, marginBottom: 5 }}>📍 {d.adresse}, {d.codePostal} {d.ville}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <Tag bg={GOL} c={GO}>🕐 {d.slotFrom}–{d.slotTo}</Tag>
                        <Tag bg={RL} c={R}>🌲 {d.taille}</Tag>
                        <Tag bg={GL} c={G}>{d.prix}€</Tag>
                      </div>
                    </div>
                  </div>
                  <NavBtns d={d} />
                </div>
              </div>
            ))}

            {/* Done deliveries */}
            {dayList.filter((d) => d.livree).map((d) => (
              <div key={d.id} style={{ background: "#F9FEF9", borderRadius: 13, border: "1px solid " + GL, padding: "10px 13px", opacity: 0.65, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, textDecoration: "line-through", color: MU }}>{d.prenom} {d.nom}</div>
                  <div style={{ fontSize: 11, color: MU }}>{d.ville} · {d.slotFrom}–{d.slotTo}</div>
                </div>
                <span style={{ background: GL, color: G, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>LIVRÉ ✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function App() {
  const today = todayISO();
  const [tab, setTab] = useState("agenda");
  const [deliveries, setDeliveries] = useState(() => load(SK));
  const [archives, setArchives] = useState(() => load(AK));
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selDate, setSelDate] = useState(today);
  const [scanStep, setScanStep] = useState("upload");
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState(null);
  const [form, setForm] = useState(null);
  const [routeDay, setRouteDay] = useState(null);
  const [route, setRoute] = useState(null);
  const [rLoading, setRLoading] = useState(false);
  const [rErr, setRErr] = useState(null);
  const [histDay, setHistDay] = useState(null);
  const [recapYear, setRecapYear] = useState(() => String(new Date().getFullYear()));
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();
  const camRef = useRef();

  useEffect(() => { persist(SK, deliveries); }, [deliveries]);
  useEffect(() => { persist(AK, archives); }, [archives]);

  useEffect(() => {
    const run = () => {
      const t = todayISO();
      setDeliveries((prev) => {
        const toArch = prev.filter((d) => d.livree && d.deliveryDate < t);
        if (!toArch.length) return prev;
        setArchives((a) => {
          const ids = new Set(a.map((x) => x.id));
          return [...a, ...toArch.filter((x) => !ids.has(x.id))];
        });
        return prev.filter((d) => !(d.livree && d.deliveryDate < t));
      });
    };
    run();
    const tid = setInterval(run, 60000);
    return () => clearInterval(tid);
  }, []);

  const showToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3500); };

  const grouped = deliveries.reduce((acc, d) => {
    if (!acc[d.deliveryDate]) acc[d.deliveryDate] = [];
    acc[d.deliveryDate].push(d);
    return acc;
  }, {});
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom)));

  const archGrouped = archives.reduce((acc, d) => {
    if (!acc[d.deliveryDate]) acc[d.deliveryDate] = [];
    acc[d.deliveryDate].push(d);
    return acc;
  }, {});

  const marked = {};
  [...deliveries, ...archives].forEach((d) => {
    if (d.deliveryDate) marked[d.deliveryDate] = (marked[d.deliveryDate] || 0) + 1;
  });

  const selActive = (grouped[selDate] || []).slice().sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom));
  const selArch = (archGrouped[selDate] || []).slice().sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom));
  const selAll = [...selActive, ...selArch];

  const handleFile = useCallback((file) => {
    if (!file) return;
    setScanErr(null); setForm(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target.result;
      setPreview(url); setScanStep("form"); setScanning(true);
      try {
        const p = await parseSlip(url.split(",")[1], file.type || "image/jpeg");
        setForm({ ...p, deliveryDate: today, slotFrom: "09:00", slotTo: "12:00" });
      } catch (ex) {
        setScanErr("Impossible de lire ce document. Essaie une meilleure photo.");
      } finally { setScanning(false); }
    };
    reader.readAsDataURL(file);
  }, [today]);

  const newForm = (date) => ({ prenom: "", nom: "", adresse: "", codePostal: "", ville: "", email: null, telephone: null, produit: "Sapin Nordmann", taille: "", prix: 0, notes: null, deliveryDate: date || today, slotFrom: "09:00", slotTo: "12:00" });

  const confirmAdd = () => {
    if (!form) return;
    const d = { ...form, id: Date.now(), createdAt: new Date().toISOString(), livree: false };
    setDeliveries((p) => [...p, d]);
    showToast("🎄 " + form.prenom + " " + form.nom + " ajouté·e !");
    setPreview(null); setForm(null); setScanErr(null); setScanStep("upload");
    setTab("agenda"); setSelDate(form.deliveryDate);
    const dd = new Date(form.deliveryDate);
    setCalYear(dd.getFullYear()); setCalMonth(dd.getMonth());
  };

  const resetScan = () => { setPreview(null); setForm(null); setScanErr(null); setScanStep("upload"); };
  const startEdit = (d) => { setEditId(d.id); setEditForm({ prenom: d.prenom, nom: d.nom, adresse: d.adresse, codePostal: d.codePostal, ville: d.ville, email: d.email, telephone: d.telephone, produit: d.produit, taille: d.taille, prix: d.prix, notes: d.notes, deliveryDate: d.deliveryDate, slotFrom: d.slotFrom, slotTo: d.slotTo }); };
  const saveEdit = () => { setDeliveries((p) => p.map((d) => d.id === editId ? { ...d, ...editForm } : d)); setEditId(null); setEditForm(null); showToast("✅ Livraison modifiée !"); };
  const cancelEdit = () => { setEditId(null); setEditForm(null); };
  const markDone = (id) => setDeliveries((p) => p.map((d) => d.id === id ? { ...d, livree: !d.livree } : d));
  const removeDel = (id) => { setDeliveries((p) => p.filter((d) => d.id !== id)); showToast("Supprimé", true); };

  const handleRoute = async (day) => {
    const picks = (grouped[day] || []).filter((d) => !d.livree).sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom));
    if (!picks.length) return;
    setRouteDay(day); setRoute(null); setRErr(null); setRLoading(true);
    try { const r = await calcRoute(picks); setRoute({ ...r, picks }); }
    catch (e) { setRErr("Erreur. Réessaie."); }
    finally { setRLoading(false); }
  };

  const archDays = Object.keys(archGrouped).sort().reverse();
  const archByMonth = archDays.reduce((acc, d) => { const m = d.slice(0, 7); if (!acc[m]) acc[m] = []; acc[m].push(d); return acc; }, {});
  const histDetail = histDay ? (archGrouped[histDay] || []).slice().sort((a, b) => slotMin(a.slotFrom) - slotMin(b.slotFrom)) : [];
  const allYears = [...new Set([...deliveries, ...archives].map((d) => d.deliveryDate && d.deliveryDate.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!allYears.includes(recapYear)) allYears.unshift(recapYear);
  const recapRows = [...deliveries, ...archives].filter((d) => d.deliveryDate && d.deliveryDate.startsWith(recapYear));
  const totalCA = recapRows.reduce((s, d) => s + (d.prix || 0), 0);
  const bySize = recapRows.reduce((acc, d) => { const k = d.taille || "?"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const byProd = recapRows.reduce((acc, d) => { const k = d.produit || "?"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const pendingCount = deliveries.filter((d) => !d.livree).length;
  const doneCount = deliveries.filter((d) => d.livree).length;
  const slotBtns = [["Matin","08:00","12:00"],["Midi","12:00","14:00"],["A-midi","14:00","18:00"],["Soir","18:00","21:00"]];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: BG, minHeight: "100vh", color: TX }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bannerIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes tin { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .fade { animation: up .22s ease; }
        .btn { cursor: pointer; border: none; font-family: inherit; transition: all .15s; }
        .btn:hover { filter: brightness(.9); }
        .btn:active { transform: scale(.97); }
        .ifield { background: #FFF8F8; border: 1.5px solid #E8D0D0; border-radius: 10px; padding: 10px 12px; font-family: inherit; font-size: 16px; color: ${TX}; outline: none; width: 100%; transition: border .2s; -webkit-appearance: none; appearance: none; }
        .ifield:focus { border-color: ${R}; }
        select.ifield { cursor: pointer; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #D0B8B8; border-radius: 3px; }
        button:focus { outline: none; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", bottom: 88, left: "50%", background: toast.err ? RD : GD, color: "#fff", padding: "11px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 999, animation: "tin .3s ease", transform: "translateX(-50%)", maxWidth: "90vw", textAlign: "center", boxShadow: "0 4px 16px rgba(0,0,0,.25)" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", padding: "14px 15px 12px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(192,57,43,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 480, margin: "0 auto" }}>
          <span style={{ fontSize: 26 }}>🎄</span>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Mon Arbre de Noël</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 1, textTransform: "capitalize" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <div style={{ background: "rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{pendingCount}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.75)", marginTop: 1 }}>à livrer</div>
            </div>
            <div style={{ background: GD, borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{doneCount}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.75)", marginTop: 1 }}>livrés</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 14px 86px", maxWidth: 480, margin: "0 auto" }}>

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div className="fade">
            <CalGrid year={calYear} month={calMonth} marked={marked} selected={selDate} onSelect={setSelDate}
              onPrev={() => { if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); } else setCalMonth((m) => m - 1); }}
              onNext={() => { if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); } else setCalMonth((m) => m + 1); }} />

            {selDate && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: R, textTransform: "capitalize" }}>{fmtDay(selDate)}</div>
                    <div style={{ fontSize: 11, color: MU }}>{selAll.length} livraison{selAll.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {selActive.filter((d) => !d.livree).length > 0 && (
                      <button className="btn" onClick={() => handleRoute(selDate)}
                        style={{ background: "linear-gradient(135deg," + G + "," + GD + ")", color: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                        {rLoading && routeDay === selDate ? <Loader /> : "🗺️"} Route
                      </button>
                    )}
                    <button className="btn" onClick={() => { setForm(newForm(selDate)); setScanStep("form"); setTab("scan"); }}
                      style={{ background: R, color: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>+ Bon</button>
                  </div>
                </div>

                {routeDay === selDate && route && !rLoading && (
                  <div className="fade" style={{ background: "#F0F5FF", border: "1px solid #C0CCFF", borderRadius: 13, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#3040B8" }}>⏱ {route.tempsEstime}</span>
                      <span style={{ color: "#A0A8D8" }}>·</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#3040B8" }}>🚗 {route.distanceEstimee}</span>
                    </div>
                    {(route.conseils || []).map((c, i) => <div key={i} style={{ fontSize: 11, color: "#5060A0", marginBottom: 2 }}>💡 {c}</div>)}
                    <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
                      {(route.ordre || []).map((num, i) => {
                        const d = route.picks[num - 1]; if (!d) return null;
                        return (
                          <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", borderRadius: 9, padding: "9px 11px", border: "1px solid #D0D8F8" }}>
                            <div style={{ background: "#3040B8", color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{d.prenom} {d.nom}</div>
                              <div style={{ fontSize: 11, color: "#8090C0" }}>🕐 {d.slotFrom}–{d.slotTo} · {d.ville}</div>
                            </div>
                            <button className="btn" onClick={() => markDone(d.id)} style={{ background: GL, border: "none", borderRadius: 7, padding: "5px 9px", fontSize: 11, color: G, fontWeight: 700 }}>✓</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {routeDay === selDate && rErr && <div style={{ background: "#FEF2F2", border: "1px solid " + RL, borderRadius: 9, padding: 10, color: R, fontSize: 12, marginBottom: 10 }}>⚠️ {rErr}</div>}

                {selAll.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#C8A8A8" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>Aucune livraison ce jour</div>
                    <button className="btn" onClick={() => setTab("scan")} style={{ background: R, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 12, fontWeight: 700 }}>+ Scanner un bon</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selActive.map((d, i) => <BannerCard key={d.id} d={d} index={i} onEdit={() => startEdit(d)} onCheck={() => markDone(d.id)} onDelete={() => removeDel(d.id)} />)}
                    {selArch.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: G, letterSpacing: 1, textTransform: "uppercase", margin: "6px 0" }}>Archivés</div>
                        {selArch.map((d, i) => <BannerCard key={d.id} d={d} index={i} readonly />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CARTE ── */}
        {tab === "map" && <MapTab deliveries={deliveries} archives={archives} />}

        {/* ── SCAN ── */}
        {tab === "scan" && (
          <div className="fade">
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: R, marginBottom: 3 }}>Nouveau bon</h2>
            <p style={{ fontSize: 12, color: MU, marginBottom: 14 }}>Scanne ou photographie un bon de livraison</p>

            {scanStep === "upload" && (
              <div>
                <div style={{ border: "2px dashed #F1948A", borderRadius: 16, padding: "34px 15px", textAlign: "center", background: "#FFF8F8", marginBottom: 10 }}
                  onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                  onDragOver={(e) => e.preventDefault()}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Dépose le bon ici</div>
                  <div style={{ fontSize: 12, color: MU, marginBottom: 14 }}>ou choisis une option</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button className="btn" onClick={() => camRef.current && camRef.current.click()} style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", color: "#fff", borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 600 }}>📷 Caméra</button>
                    <button className="btn" onClick={() => fileRef.current && fileRef.current.click()} style={{ background: "#FFF", border: "1.5px solid " + RL, color: R, borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 600 }}>🗂 Galerie</button>
                  </div>
                </div>
                <button className="btn" onClick={() => { setForm(newForm(today)); setScanStep("form"); }}
                  style={{ width: "100%", background: "none", border: "1.5px dashed #F1948A", color: MU, borderRadius: 11, padding: 11, fontSize: 13 }}>
                  + Saisir manuellement
                </button>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />

            {scanStep === "form" && (
              <div>
                {preview && (
                  <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid " + RL, marginBottom: 12, position: "relative" }}>
                    <img src={preview} alt="" style={{ width: "100%", maxHeight: 130, objectFit: "cover", display: "block" }} />
                    {scanning && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,248,248,.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7 }}>
                        <Loader /><span style={{ fontSize: 13, color: R, fontWeight: 600 }}>Analyse IA en cours…</span>
                      </div>
                    )}
                  </div>
                )}
                {scanErr && <div style={{ background: "#FEF2F2", border: "1px solid " + RL, borderRadius: 10, padding: 11, color: R, fontSize: 12, marginBottom: 11 }}>⚠️ {scanErr}</div>}
                {form && !scanning && (
                  <div style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,.07)", overflow: "hidden" }}>
                    <div style={{ height: 4, background: "linear-gradient(90deg," + R + "," + G + ")" }} />
                    <div style={{ padding: 15 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: R, marginBottom: 12 }}>✏️ VÉRIFIE ET COMPLÈTE</div>
                      <div style={{ background: "#FFF8F8", border: "2px solid " + RL, borderRadius: 12, padding: 13, marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: R, marginBottom: 7 }}>📅 DATE DE LIVRAISON</div>
                        <input className="ifield" type="date" value={form.deliveryDate} min={today} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} style={{ marginBottom: 11, fontWeight: 700, fontSize: 16, color: R, borderColor: "#F1948A" }} />
                        <div style={{ fontSize: 10, fontWeight: 700, color: R, marginBottom: 7 }}>🕐 CRÉNEAU HORAIRE</div>
                        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                          {slotBtns.map((sb) => {
                            const on = form.slotFrom === sb[1] && form.slotTo === sb[2];
                            return <button key={sb[0]} className="btn" style={{ flex: 1, padding: "7px 2px", borderRadius: 7, border: "1.5px solid " + (on ? G : RL), background: on ? G : "#fff", fontSize: 10, fontWeight: 700, color: on ? "#fff" : R }} onClick={() => setForm({ ...form, slotFrom: sb[1], slotTo: sb[2] })}>{sb[0]}</button>;
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>De</div>
                            <select className="ifield" value={form.slotFrom} onChange={(e) => setForm({ ...form, slotFrom: e.target.value })}>
                              {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <span style={{ paddingTop: 14, color: MU, fontWeight: 700 }}>→</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>À</div>
                            <select className="ifield" value={form.slotTo} onChange={(e) => setForm({ ...form, slotTo: e.target.value })}>
                              {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: MU, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Coordonnées client</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 7 }}>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Prénom</div><input className="ifield" value={form.prenom || ""} onChange={(e) => setForm({ ...form, prenom: e.target.value })}  /></div>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Nom</div><input className="ifield" value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })}  /></div>
                      </div>
                      <div style={{ marginBottom: 7 }}><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Adresse</div><input className="ifield" value={form.adresse || ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })}  /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 7, marginBottom: 7 }}>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Code postal</div><input className="ifield" value={form.codePostal || ""} onChange={(e) => setForm({ ...form, codePostal: e.target.value })}  /></div>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Ville</div><input className="ifield" value={form.ville || ""} onChange={(e) => setForm({ ...form, ville: e.target.value })}  /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Téléphone</div><input className="ifield" value={form.telephone || ""} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="—"  /></div>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Email</div><input className="ifield" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="—"  /></div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: MU, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Produit</div>
                      <div style={{ marginBottom: 7 }}><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Sapin</div><input className="ifield" value={form.produit || ""} onChange={(e) => setForm({ ...form, produit: e.target.value })}  /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 16 }}>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Taille</div><input className="ifield" value={form.taille || ""} onChange={(e) => setForm({ ...form, taille: e.target.value })} placeholder="Ex: 180cm"  /></div>
                        <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Prix (€)</div><input className="ifield" type="number" value={form.prix || ""} onChange={(e) => setForm({ ...form, prix: parseFloat(e.target.value) || 0 })}  /></div>
                      </div>
                      <div style={{ display: "flex", gap: 7 }}>
                        <button className="btn" onClick={resetScan} style={{ flex: 1, background: "#FFF", border: "1px solid " + RL, color: R, borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 600 }}>Annuler</button>
                        <button className="btn" onClick={confirmAdd} style={{ flex: 2, background: "linear-gradient(135deg," + R + "," + RD + ")", color: "#fff", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700 }}>🎄 Enregistrer</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── HISTORIQUE ── */}
        {tab === "hist" && (
          <div className="fade">
            {histDay ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <button className="btn" onClick={() => setHistDay(null)} style={{ background: "#FFF", border: "1px solid " + RL, borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: R, fontSize: 18 }}>‹</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: R, textTransform: "capitalize" }}>{new Date(histDay).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
                    <div style={{ fontSize: 10, color: MU }}>{histDetail.length} livraison{histDetail.length !== 1 ? "s" : ""}</div>
                  </div>
                  <button className="btn" onClick={() => doExport(histDetail, "livraisons-" + histDay + ".csv")} style={{ background: G, color: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11, fontWeight: 700 }}>⬇️ CSV</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 13 }}>
                  {[[histDetail.length,"livraisons",R,RL],[histDetail.reduce((s,d)=>s+(d.prix||0),0)+"€","CA",G,GL],[[...new Set(histDetail.map((d)=>d.taille))].length+" tailles","formats",GO,GOL]].map((item) => (
                    <div key={item[1]} style={{ background: item[3], borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: item[2], lineHeight: 1 }}>{item[0]}</div>
                      <div style={{ fontSize: 9, color: MU, marginTop: 2 }}>{item[1]}</div>
                    </div>
                  ))}
                </div>
                {histDetail.map((d, i) => <BannerCard key={d.id} d={d} index={i} readonly />)}
              </div>
            ) : (
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: R, marginBottom: 3 }}>Historique</h2>
                <p style={{ fontSize: 11, color: MU, marginBottom: 14 }}>{archDays.length} jour{archDays.length !== 1 ? "s" : ""} archivé{archDays.length !== 1 ? "s" : ""}</p>
                {archDays.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 20px", color: "#C8A8A8" }}>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>📚</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Aucun historique pour l'instant</div>
                  </div>
                ) : (
                  <div>
                    {Object.entries(archByMonth).sort((a, b) => b[0].localeCompare(a[0])).map((entry) => {
                      const m = entry[0]; const days = entry[1];
                      return (
                        <div key={m} style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: R, letterSpacing: 1, textTransform: "uppercase", marginBottom: 9, borderLeft: "3px solid " + R, paddingLeft: 8 }}>
                            {new Date(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · {days.reduce((s, d) => (archGrouped[d] || []).length + s, 0)} livraisons
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {days.map((day) => {
                              const list = archGrouped[day] || [];
                              const ca = list.reduce((s, d) => s + (d.prix || 0), 0);
                              const dd = new Date(day);
                              return (
                                <button key={day} className="btn" onClick={() => setHistDay(day)} style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,.07)", padding: "12px 13px", textAlign: "left", width: "100%", display: "flex", alignItems: "center", gap: 11 }}>
                                  <div style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", borderRadius: 9, width: 44, height: 44, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.65)", textTransform: "uppercase", fontWeight: 700 }}>{dd.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                                    <div style={{ fontSize: 15, color: "#fff", fontWeight: 800, lineHeight: 1.1 }}>{dd.getDate()}</div>
                                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.65)" }}>{dd.toLocaleDateString("fr-FR", { month: "short" })}</div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🎄 {list.length} livraison{list.length !== 1 ? "s" : ""}</div>
                                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                      <Tag bg={GL} c={G}>{ca}€</Tag>
                                      {[...new Set(list.map((d) => d.taille).filter(Boolean))].slice(0, 3).map((t) => <Tag key={t} bg={RL} c={R}>{t}</Tag>)}
                                    </div>
                                  </div>
                                  <div style={{ color: MU, fontSize: 20 }}>›</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button className="btn" onClick={() => doExport(archives, "historique-complet.csv")} style={{ width: "100%", background: "linear-gradient(135deg," + G + "," + GD + ")", color: "#fff", borderRadius: 11, padding: "13px", fontSize: 13, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>⬇️ Exporter tout l'historique</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── RÉCAP ── */}
        {tab === "recap" && (
          <div className="fade">
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: R, marginBottom: 3 }}>Récap Saison</h2>
            <p style={{ fontSize: 11, color: MU, marginBottom: 14 }}>Statistiques et export annuel</p>
            <div style={{ background: "linear-gradient(135deg," + R + "," + RD + ")", borderRadius: 14, padding: 16, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginBottom: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Saison</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {allYears.map((y) => (
                  <button key={y} className="btn" onClick={() => setRecapYear(y)} style={{ background: recapYear === y ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.1)", border: "1.5px solid " + (recapYear === y ? "#fff" : "rgba(255,255,255,.3)"), color: "#fff", borderRadius: 9, padding: "8px 18px", fontSize: 15, fontWeight: 700 }}>{y}</button>
                ))}
              </div>
              <button className="btn" onClick={() => {
                const rows = [...deliveries, ...archives].filter((d) => d.deliveryDate && d.deliveryDate.startsWith(recapYear)).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
                if (!rows.length) { showToast("Aucune livraison en " + recapYear, true); return; }
                doExport(rows, "saison-" + recapYear + ".csv");
                showToast("✓ Export Saison " + recapYear + " — " + rows.length + " livraisons");
              }} style={{ background: "#fff", color: R, borderRadius: 10, padding: "12px 24px", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
                ⬇️ Télécharger Saison {recapYear}
              </button>
            </div>
            {recapRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", color: "#C8A8A8" }}><div style={{ fontSize: 36, marginBottom: 8 }}>📊</div><div style={{ fontSize: 13 }}>Aucune livraison en {recapYear}</div></div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 13 }}>
                  {[[recapRows.length,"livraisons",R,RL],[totalCA+"€","CA total",G,GL],[Object.keys(bySize).length+" tailles","formats",GO,GOL]].map((item) => (
                    <div key={item[1]} style={{ background: item[3], borderRadius: 11, padding: "11px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: item[2], lineHeight: 1 }}>{item[0]}</div>
                      <div style={{ fontSize: 9, color: MU, marginTop: 3 }}>{item[1]}</div>
                    </div>
                  ))}
                </div>
                {[["🌲 Par taille", bySize], ["📦 Par type", byProd]].map((section) => {
                  if (!Object.keys(section[1]).length) return null;
                  return (
                    <div key={section[0]} style={{ background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,.07)", padding: 13, marginBottom: 9 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: R, letterSpacing: 1, textTransform: "uppercase", marginBottom: 9 }}>{section[0]}</div>
                      {Object.entries(section[1]).sort((a, b) => b[1] - a[1]).map((kv) => (
                        <div key={kv[0]} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kv[0]}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                            <div style={{ height: 6, borderRadius: 3, background: "linear-gradient(90deg," + R + "," + G + ")", width: Math.max(kv[1] * 18, 8) }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: R, minWidth: 20, textAlign: "right" }}>{kv[1]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editId && editForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={cancelEdit}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "20px 16px 40px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: "#E0D0D0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: R, marginBottom: 14, fontWeight: 700 }}>✏️ Modifier la livraison</div>

            <div style={{ background: "#FFF8F8", border: "2px solid " + RL, borderRadius: 12, padding: 13, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: R, marginBottom: 7 }}>📅 DATE DE LIVRAISON</div>
              <input className="ifield" type="date" value={editForm.deliveryDate} onChange={(e) => setEditForm({ ...editForm, deliveryDate: e.target.value })} style={{ marginBottom: 11, fontWeight: 700, fontSize: 16, color: R, borderColor: "#F1948A" }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: R, marginBottom: 7 }}>🕐 CRÉNEAU HORAIRE</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {[["Matin","08:00","12:00"],["Midi","12:00","14:00"],["A-midi","14:00","18:00"],["Soir","18:00","21:00"]].map((sb) => {
                  const on = editForm.slotFrom === sb[1] && editForm.slotTo === sb[2];
                  return <button key={sb[0]} className="btn" style={{ flex: 1, padding: "7px 2px", borderRadius: 7, border: "1.5px solid " + (on ? G : RL), background: on ? G : "#fff", fontSize: 10, fontWeight: 700, color: on ? "#fff" : R }} onClick={() => setEditForm({ ...editForm, slotFrom: sb[1], slotTo: sb[2] })}>{sb[0]}</button>;
                })}
              </div>
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>De</div>
                  <select className="ifield" value={editForm.slotFrom} onChange={(e) => setEditForm({ ...editForm, slotFrom: e.target.value })}>
                    {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <span style={{ paddingTop: 14, color: MU, fontWeight: 700 }}>→</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>À</div>
                  <select className="ifield" value={editForm.slotTo} onChange={(e) => setEditForm({ ...editForm, slotTo: e.target.value })}>
                    {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: MU, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Coordonnées client</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 7 }}>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Prénom</div><input className="ifield" value={editForm.prenom || ""} onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })}  /></div>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Nom</div><input className="ifield" value={editForm.nom || ""} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}  /></div>
            </div>
            <div style={{ marginBottom: 7 }}><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Adresse</div><input className="ifield" value={editForm.adresse || ""} onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })}  /></div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 7, marginBottom: 7 }}>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Code postal</div><input className="ifield" value={editForm.codePostal || ""} onChange={(e) => setEditForm({ ...editForm, codePostal: e.target.value })}  /></div>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Ville</div><input className="ifield" value={editForm.ville || ""} onChange={(e) => setEditForm({ ...editForm, ville: e.target.value })}  /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Téléphone</div><input className="ifield" value={editForm.telephone || ""} onChange={(e) => setEditForm({ ...editForm, telephone: e.target.value })} placeholder="—"  /></div>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Email</div><input className="ifield" value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="—"  /></div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: MU, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Produit</div>
            <div style={{ marginBottom: 7 }}><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Sapin</div><input className="ifield" value={editForm.produit || ""} onChange={(e) => setEditForm({ ...editForm, produit: e.target.value })}  /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 20 }}>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Taille</div><input className="ifield" value={editForm.taille || ""} onChange={(e) => setEditForm({ ...editForm, taille: e.target.value })} placeholder="Ex: 180cm"  /></div>
              <div><div style={{ fontSize: 9, color: MU, marginBottom: 3 }}>Prix (€)</div><input className="ifield" type="number" value={editForm.prix || ""} onChange={(e) => setEditForm({ ...editForm, prix: parseFloat(e.target.value) || 0 })}  /></div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={cancelEdit} style={{ flex: 1, background: "#FFF", border: "1px solid " + RL, color: R, borderRadius: 11, padding: "13px", fontSize: 13, fontWeight: 600 }}>Annuler</button>
              <button className="btn" onClick={saveEdit} style={{ flex: 2, background: "linear-gradient(135deg," + R + "," + RD + ")", color: "#fff", borderRadius: 11, padding: "13px", fontSize: 14, fontWeight: 700 }}>✅ Enregistrer les modifications</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV — 5 onglets */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid " + RL, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[
          { id: "agenda", em: "🗓",  label: "Agenda" },
          { id: "map",    em: "🗺️",  label: "Carte" },
          { id: "scan",   em: "📋",  label: "Scanner" },
          { id: "hist",   em: "📚",  label: "Historique" },
          { id: "recap",  em: "📊",  label: "Saison" }
        ].map((nav) => (
          <button key={nav.id} onClick={() => { setTab(nav.id); if (nav.id !== "hist") setHistDay(null); }}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "8px 0 5px", cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", color: tab === nav.id ? R : MU, transition: "color .15s" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{nav.em}</span>
            <span style={{ fontSize: 9, fontWeight: tab === nav.id ? 700 : 400 }}>{nav.label}</span>
            {tab === nav.id && <div style={{ width: 20, height: 2, background: R, borderRadius: 2, marginTop: 1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
// App
