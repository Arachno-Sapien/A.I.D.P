# Gates: chat list, pin/archive, icons, and UI review

OWNS: package.json, package-lock.json, docs/decisions/0018-icons-lucide.md, docs/design.md, docs/user-guide.md, CHANGELOG.md, AGENTS.md, src/App.tsx, src/App.test.tsx, src/features/workspace/WorkspaceScreen.tsx, src/features/workspace/WorkspaceScreen.test.tsx, src/features/chat/ConversationList.tsx, src/features/chat/ConversationList.test.tsx, src/features/chat/ChatScreen.tsx, src/features/chat/ChatScreen.test.tsx, src/features/chat/store.ts, src/features/chat/store.test.ts, src-tauri/src/db/mod.rs, src-tauri/src/db/conversations.rs, src-tauri/src/history.rs, src-tauri/src/commands/history.rs, src-tauri/src/lib.rs, src/lib/bindings.ts, .claude/skills/web-design-guidelines/**, .agents/skills/web-design-guidelines/**, skills-lock.json, .ai/memory/**

Scope: Add lucide-react icons to top nav, workspace bar, and chat list; make chat list hideable (Ctrl+B) and resizable; add migration 5 for pinning and archiving chats; add web-design-guidelines skill and apply UI polish.

- [x] G1: top nav and workspace bar buttons render icons and retain accessible names
  CHECK: npx vitest run -t "shows an icon|bar buttons are icons" src/App.test.tsx src/features/workspace/WorkspaceScreen.test.tsx
  EXPECT: 2 passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=5038bb58bdce0071dcdee2f70315950d8f35c1c9d1480c54ef0990980e985ad1; exit=0; EXPECT=matched; output-sha256=ff371b977f785d07d989fb9a05ebd8fcaf9a96b21a405b6d05a184ef4236970b; output-bytes=835; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries

- [x] G2: chat list hides with button and Ctrl+B and resizes within width limits
  CHECK: npx vitest run -t "chat list hides and shows from its button|Ctrl\+B toggles the chat list" src/features/chat/ChatScreen.test.tsx
  EXPECT: 2 passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d84b6dbaaa657fd722845a62bbc69fc83645cc7edc7d56b791422945c97d6534; exit=0; EXPECT=matched; output-sha256=ee766580e30a90443c2ffb51864c8489fb228eb0a3b917ed14518ce4d71b230d; output-bytes=707; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries

- [x] G3: migration 5 applies and Rust db/history pin and archive operations pass
  CHECK: cargo test --manifest-path src-tauri/Cargo.toml pin_and_archive_round_trip
  EXPECT: test pin_and_archive_round_trip ... ok
  EVIDENCE: automatic-evidence=v1; definition-sha256=91dae737be0e5c03b683a45ac407ed017a8022ad30641cbc145bb9a39e45b7e3; exit=0; EXPECT=matched; output-sha256=bf2eec133871fae0ae5e954e430a3292861d5d22cc23de28d20476efa90401e9; output-bytes=2782; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries

- [x] G4: frontend chat store and conversation list support pin, archive, and filter groups
  CHECK: npx vitest run -t "pinned chats sit above recent ones|Archive moves a chat into Archived" src/features/chat/store.test.ts src/features/chat/ConversationList.test.tsx
  EXPECT: 2 passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=8791df14535d4b179e6746f3f596e521a3a94221b3ac4ac953cc24a326300b3b; exit=0; EXPECT=matched; output-sha256=9a56c02199c4b42563a0b0f2cac9852e347ab1470947384f749141c377d773c0; output-bytes=919; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries

- [x] G5: web-design-guidelines skill is installed and mirrored identically across agent directories
  CHECK: node -e "const fs = require('fs'); const a = fs.readFileSync('.claude/skills/web-design-guidelines/SKILL.md'); const b = fs.readFileSync('.agents/skills/web-design-guidelines/SKILL.md'); if (Buffer.compare(a, b) === 0) console.log('SKILLS_IDENTICAL');"
  EXPECT: SKILLS_IDENTICAL
  EVIDENCE: automatic-evidence=v1; definition-sha256=200e65dbb41a00137bdbb0e179833755203bf0b7a126b65da065023aa723175e; exit=0; EXPECT=matched; output-sha256=5f6c4666e4468c2166a2aada0c4a15dc3687d9bdbee078400cacb4edc0011c94; output-bytes=17; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries

- [x] G6: typescript typecheck passes without errors
  CHECK: npm run typecheck
  EXPECT: tsc --noEmit
  EVIDENCE: automatic-evidence=v1; definition-sha256=f3a9f72cca7186327f0d2cf2bb0c6765c563f0877f0c6b6c7f2096788006be4d; exit=0; EXPECT=matched; output-sha256=feeeae77409f668073004c2cfdc8fff8c7dbbbeb7b3afd94be75a1d406f025d2; output-bytes=69; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\SYED\Documents\Junaid\A.I.D.P; path=116b443f33f6/54 entries
