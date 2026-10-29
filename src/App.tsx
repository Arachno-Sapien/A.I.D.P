import { useState } from "react";
import { commands } from "./lib/bindings";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await commands.greet(name));
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-8 select-none">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-semibold text-lg">
            AI
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">aidp</h1>
          <p className="text-xs text-slate-400">Desktop AI Model App</p>
        </div>

        <form
          className="w-full flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <div className="flex gap-2">
            <input
              id="greet-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Enter your name..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors cursor-pointer"
            >
              Greet
            </button>
          </div>
        </form>

        {greetMsg && (
          <div className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 text-sm text-indigo-300 text-center">
            {greetMsg}
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
