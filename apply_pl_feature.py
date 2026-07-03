import sys

path = "src/app/page.js"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

def find_unique(substr, lines, label):
    matches = [i for i, l in enumerate(lines) if substr in l]
    if len(matches) == 0:
        print(f"FAILED - could not find anchor for '{label}' (substring: {substr!r})")
        sys.exit(1)
    if len(matches) > 1:
        print(f"FAILED - found {len(matches)} matches for '{label}', expected 1. Line numbers: {[m+1 for m in matches]}")
        sys.exit(1)
    return matches[0]

# --- Edit 1: function signature ---
sig_idx = find_unique('markAllRead }) {', lines, "Dashboard signature")
lines[sig_idx] = lines[sig_idx].replace('markAllRead }) {', 'markAllRead, onAddBet }) {')
print("Applied: signature")

# --- Edit 2: state hooks after "const hour" line ---
hour_idx = find_unique('const hour = new Date().getHours();', lines, "hour line")
new_hooks = [
    '  const [editingPL, setEditingPL] = useState(false);\n',
    '  const [plInput, setPlInput] = useState("");\n',
    '  const [savingPL, setSavingPL] = useState(false);\n',
]
lines[hour_idx+1:hour_idx+1] = new_hooks
print("Applied: state hooks")

# --- Edit 3: This Week card, anchored on {weekLabel} which is unique ---
label_idx = find_unique('{weekLabel}', lines, "weekLabel line")
right_idx = label_idx - 1   # the opening <div style={{ textAlign: "right" }}> line
if 'textAlign: "right"' not in lines[right_idx]:
    print(f"FAILED - line above weekLabel is not the expected opening div. Found: {lines[right_idx]!r}")
    sys.exit(1)

close_idx = None
for j in range(label_idx, label_idx + 6):
    if lines[j].strip() == '</div>':
        close_idx = j
        break
if close_idx is None:
    print("FAILED - could not find closing </div> for This Week block within range")
    sys.exit(1)

new_block = '''          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>This Week ~ {weekLabel}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: netPL >= 0 ? "#2ecc71" : "#e74c3c" }}>{netPL >= 0 ? "+$" :"-$"}{Math.abs(netPL).toFixed(0)}</div>
              <button
                onClick={() => { setPlInput(netPL.toFixed(0)); setEditingPL(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, color: "#555" }}
                aria-label="Edit weekly P&L"
              >EDIT_ICON</button>
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Week P&L ~ {goalPct.toFixed(0)}% of ${user.goal} goal</div>
            {editingPL && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                <input
                  type="number"
                  value={plInput}
                  onChange={(e) => setPlInput(e.target.value)}
                  placeholder="Set total week P&L"
                  style={{ width: 110, background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 6, color: "#fff", fontSize: 13, padding: "6px 8px", textAlign: "right" }}
                />
                <button
                  disabled={savingPL || plInput === ""}
                  onClick={async () => {
                    const target = parseFloat(plInput);
                    if (isNaN(target)) return;
                    const diff = target - netPL;
                    if (Math.abs(diff) < 0.01) { setEditingPL(false); return; }
                    setSavingPL(true);
                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    await onAddBet({
                      sport: "Other",
                      game: "Manual Adjustment",
                      betType: "manual_adjustment",
                      pick: "Manual P&L Adjustment",
                      odds: "+100",
                      amount: Math.abs(diff),
                      type: "Planned",
                      result: diff >= 0 ? "Win" : "Loss",
                      isToday: true,
                      gameDate: todayStr,
                      gameTime: null,
                      gameId: null,
                      toWin: diff >= 0 ? diff : null,
                    });
                    setSavingPL(false);
                    setEditingPL(false);
                  }}
                  style={{ background: "#f5a623", border: "none", borderRadius: 6, color: "#0a0a0f", fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer", opacity: savingPL ? 0.6 : 1 }}
                >{savingPL ? "..." : "Save"}</button>
                <button
                  onClick={() => setEditingPL(false)}
                  style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer" }}
                >Cancel</button>
              </div>
            )}
          </div>
'''
new_block = new_block.replace('EDIT_ICON', chr(0x270F) + chr(0xFE0F))
new_block = new_block.replace(' ~ ', ' ' + chr(0xB7) + ' ')
lines[right_idx:close_idx+1] = [new_block]
print("Applied: This Week card + pencil button")

content = ''.join(lines)

# --- Edit 4: <Dashboard /> call site ---
old4 = 'markAllRead={markAllRead} />}'
new4 = 'markAllRead={markAllRead} onAddBet={addBet} />}'
count4 = content.count(old4)
if count4 != 1:
    print(f"FAILED - found {count4} matches for <Dashboard /> call site, expected 1")
    sys.exit(1)
content = content.replace(old4, new4, 1)
print("Applied: <Dashboard /> call site")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("\nAll edits applied successfully to src/app/page.js")
