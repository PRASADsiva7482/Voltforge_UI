import { create } from 'zustand';
import type { Project, CodeFile } from '../types';

interface ProjectState {
  currentProject: Project | null;
  activeCodeFile: CodeFile | null;
  isDirty: boolean;
  isSaving: boolean;

  setCurrentProject: (project: Project | null) => void;
  setActiveCodeFile: (file: CodeFile | null) => void;
  updateCodeFileContent: (fileId: string, content: string) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  activeCodeFile: null,
  isDirty: false,
  isSaving: false,

  setCurrentProject: (project) =>
    set({
      currentProject: project,
      activeCodeFile: project?.codeFiles?.[0] || null,
      isDirty: false,
    }),

  setActiveCodeFile: (file) => set({ activeCodeFile: file }),

  updateCodeFileContent: (fileId, content) =>
    set((state) => {
      if (!state.currentProject) return state;
      const updatedFiles = state.currentProject.codeFiles.map((f) =>
        f.id === fileId ? { ...f, content } : f
      );
      return {
        currentProject: { ...state.currentProject, codeFiles: updatedFiles },
        activeCodeFile:
          state.activeCodeFile?.id === fileId
            ? { ...state.activeCodeFile, content }
            : state.activeCodeFile,
        isDirty: true,
      };
    }),

  setDirty: (isDirty) => set({ isDirty }),
  setSaving: (isSaving) => set({ isSaving }),
}));
