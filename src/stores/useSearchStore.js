// src/stores/useSearchStore.js — 검색 상태 (Zustand)
import { create } from 'zustand';

const useSearchStore = create((set) => ({
  searchTerm: '',
  results: [],
  pointer: -1,

  setSearchTerm: (term) => set({ searchTerm: term }),
  setResults: (results) => set({ results }),
  setPointer: (pointer) => set({ pointer }),

  resetSearch: () => set({
    searchTerm: '',
    results: [],
    pointer: -1,
  }),
}));

export default useSearchStore;
