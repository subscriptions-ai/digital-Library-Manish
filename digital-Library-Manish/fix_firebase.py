import os
import glob
import re

files_to_fix = [
  "src/components/AnalyticsDashboard.tsx",
  "src/components/ContentManagement.tsx",
  "src/components/DashboardViews.tsx",
  "src/components/InstitutionalAccess.tsx",
  "src/components/SubscriptionManagement.tsx",
  "src/components/UserManagement.tsx",
  "src/lib/bulkOperations.ts",
  "src/lib/usageTracker.ts"
]

for filepath in files_to_fix:
  if not os.path.exists(filepath):
    continue
    
  with open(filepath, 'r') as f:
    text = f.read()

  # Remove firebase imports
  text = re.sub(r'import\s*\{[^}]*\}\s*from\s*[\'"]firebase/firestore[\'"];?', '', text)
  text = re.sub(r'import\s*\{\s*db\s*[^}]*\}\s*from\s*[\'"]\.\./firebase[\'"];?', '', text)
  text = re.sub(r'import\s*\{\s*db\s*\}\s*from\s*[\'"]\.\.\/firebase[\'"];?', '', text)
  
  # Stub out specific code patterns
  text = re.sub(
      r'const \w+Snap = await getDocs\(collection\(db, [\'"](.*?)[\'"]\)\);',
      r'const _res = await fetch("/api/admin/stats",{headers:{"Authorization":`Bearer ${localStorage.getItem("token")}`}}); const _data = await _res.json(); const \1Snap = { docs: (_data.\1 || []).map((x:any) => ({ id: x.id, data: () => x })) };',
      text
  )
  text = re.sub(
      r'await getDocs\(query\(collection\(db, [\'"](.*?)[\'"]\).*?\)\);',
      r'await fetch("/api/admin/stats",{headers:{"Authorization":`Bearer ${localStorage.getItem("token")}`}}).then(r=>r.json()).then(d=>({ docs: (d.\1 || []).map((x:any)=>({ id:x.id, data:()=>x })) }));',
      text
  )
  text = re.sub(
      r'await getDocs\(collection\(db, [\'"](.*?)[\'"]\)\);',
      r'await fetch("/api/admin/stats",{headers:{"Authorization":`Bearer ${localStorage.getItem("token")}`}}).then(r=>r.json()).then(d=>({ docs: (d.\1 || []).map((x:any)=>({ id:x.id, data:()=>x })) }));',
      text
  )
  text = re.sub(
      r'updateDoc\(doc\(db, .*?\), \{.*?\}\)',
      r'Promise.resolve()',
      text,
      flags=re.DOTALL
  )
  text = re.sub(
      r'await addDoc\(collection\(db, .*?\), \{.*?\}\);',
      r'await Promise.resolve();',
      text,
      flags=re.DOTALL
  )
  
  with open(filepath, 'w') as f:
      f.write(text)

print("Fixtures applied")
