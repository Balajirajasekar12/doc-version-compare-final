// ============================================================
// MIP Landing / Dashboard Page
// ============================================================

import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useMip } from "../context";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  Trash2,
  ArrowRight,
  BarChart3,
  AlertTriangle,
  TestTubes,
  Link2,
  Shield,
  Clock,
  FileText,
  Loader2,
  Rocket,
  Database,
} from "lucide-react";

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const { createProject, selectProject } = useMip();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const project = await createProject(name.trim(), desc.trim());
      await selectProject(project.id);
      navigate("/mip/projects");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c1118] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white">Create New Project</h2>
        <p className="mt-1 text-sm text-slate-400">Define your modernization project</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Project Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Claims Modernization"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g., Legacy Claims Processing → Spring Batch"
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.07]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-[#07090d] hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: import("../types").MipProject }) {
  const navigate = useNavigate();
  const { selectProject, deleteProject, state } = useMip();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCurrent = state.currentProjectId === project.id;
  const age = Math.floor((Date.now() - project.createdAt) / (1000 * 60 * 60 * 24));

  const handleOpen = async () => {
    await selectProject(project.id);
    navigate("/mip/upload");
  };

  const handleDelete = async () => {
    await deleteProject(project.id);
    setConfirmDelete(false);
  };

  return (
    <div className={`group rounded-xl border p-5 transition-all ${
      isCurrent
        ? "border-cyan-500/40 bg-cyan-500/[0.05]"
        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
    }`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{project.name}</h3>
            {project.status === "frozen" && (
              <Shield size={12} className="shrink-0 text-blue-400" />
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{project.description || "No description"}</p>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={handleDelete} className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/30">
              Confirm
            </button>
            <button onClick={() => setConfirmDelete(false)} className="rounded px-2 py-0.5 text-[10px] text-slate-500 hover:text-white">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
          >              <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><Clock size={10} /> {age === 0 ? "Today" : `${age}d ago`}</span>
        <span className="flex items-center gap-1"><FileText size={10} /> {project.status}</span>
      </div>

      <button
        onClick={handleOpen}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-300"
      >
        Open <ArrowRight size={12} />
      </button>
    </div>
  );
}

export default function MipLanding() {
  const { state, currentProject } = useMip();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <LayoutDashboard size={20} className="text-cyan-400" />
            Modernization Intelligence Platform
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Reconstruct requirements from legacy systems, identify modernization gaps, and build traceability — all in your browser.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-[#07090d] hover:bg-cyan-400"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Quick stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Projects", value: state.projects.length, icon: FolderKanban, color: "text-cyan-400" },
          { label: "Source Files", value: state.sourceFiles.length, icon: FileText, color: "text-emerald-400" },
          { label: "Findings", value: state.findings.length, icon: AlertTriangle, color: "text-amber-400" },
          { label: "Test Cases", value: state.testCases.length, icon: TestTubes, color: "text-purple-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{stat.label}</span>
              <stat.icon size={14} className={stat.color} />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Workflow cards */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Workflow</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { step: "01", title: "Create Project", desc: "Define legacy → modern scope", icon: FolderKanban },
            { step: "02", title: "Upload Artifacts", desc: "Upload source files and ZIPs", icon: Database },
            { step: "03", title: "Analyze & Compare", desc: "Detect differences and gaps", icon: AlertTriangle },
            { step: "04", title: "Generate Tests", desc: "Create traceability and tests", icon: TestTubes },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="font-mono text-2xl font-bold text-cyan-500/20">{item.step}</span>
              <h3 className="mt-2 text-xs font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-[11px] text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Projects list */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Projects</h2>
          <span className="text-xs text-slate-500">{state.projects.length} total</span>
        </div>

        {state.projects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 p-12 text-center">
            <Rocket size={32} className="mx-auto text-slate-600" />
            <h3 className="mt-3 text-sm font-medium text-slate-400">No projects yet</h3>
            <p className="mt-1 text-xs text-slate-600">Create your first modernization project to get started.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-1.5 mx-auto rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-xs text-cyan-300 hover:bg-cyan-500/20"
            >
              <Plus size={14} /> Create Project
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
