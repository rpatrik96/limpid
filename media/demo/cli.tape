# Limpid CLI demo — records media/demo/cli-demo.gif
#
# Regenerate (from repo root):
#   npm run build -w apps/cli && vhs media/demo/cli.tape

Output media/demo/cli-demo.gif

Set Shell "bash"
Set Theme "Dracula"
Set FontSize 18
Set Width 1200
Set Height 700
Set Padding 20

# Start clean.
Hide
Type "clear"
Enter
Show

# 1. Score a draft against good writing.
Type "# Score a draft against good writing"
Enter
Type "node apps/cli/dist/cli.js media/demo/sample.tex"
Enter
Sleep 3s

# 2. Gate in CI: cap passive voice, require grade A (non-zero exit on a miss).
Type "# Gate in CI: cap passive voice, require grade A"
Enter
Type "node apps/cli/dist/cli.js --max-passive 0.2 --min-grade A media/demo/sample.tex; echo exit=$?"
Enter
Sleep 3s
