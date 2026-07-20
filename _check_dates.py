import subprocess, json, sys

# Previous daily-selection (from commit 40b6eae)
r = subprocess.run(['git', 'show', '40b6eae:data/daily-selection.json'], capture_output=True)
d = json.loads(r.stdout)
print("=== PREVIOUS (40b6eae) ===")
for i, n in enumerate(d['news']):
    pub = n.get('published', '')
    print(f"{i+1}. published={json.dumps(pub)} source={n['source']}")

# Current daily-selection
d2 = json.load(open('data/daily-selection.json', 'r', encoding='utf8'))
print("\n=== CURRENT ===")
for i, n in enumerate(d2['news']):
    pub = n.get('published', '')
    print(f"{i+1}. published={json.dumps(pub)} source={n['source']}")
