import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "Welcome back": "Welcome back",
      "Build, simulate, and share your electronics projects": "Build, simulate, and share your electronics projects",
      "New Project": "New Project",
      "Explore": "Explore",
      "AI Generate": "AI Generate",
      "Search projects...": "Search projects...",
      "Recent Projects": "Recent Projects",
      "No projects yet": "No projects yet",
      "Create Project": "Create Project",
      "My Projects": "My Projects",
      "Settings": "Settings",
      "Dashboard": "Dashboard"
    }
  },
  es: {
    translation: {
      "Welcome back": "Bienvenido de nuevo",
      "Build, simulate, and share your electronics projects": "Construye, simula y comparte tus proyectos de electrónica",
      "New Project": "Nuevo Proyecto",
      "Explore": "Explorar",
      "AI Generate": "Generar con IA",
      "Search projects...": "Buscar proyectos...",
      "Recent Projects": "Proyectos Recientes",
      "No projects yet": "No hay proyectos aún",
      "Create Project": "Crear Proyecto",
      "My Projects": "Mis Proyectos",
      "Settings": "Configuraciones",
      "Dashboard": "Tablero"
    }
  },
  fr: {
    translation: {
      "Welcome back": "Bon retour",
      "Build, simulate, and share your electronics projects": "Construisez, simulez et partagez vos projets électroniques",
      "New Project": "Nouveau Projet",
      "Explore": "Explorer",
      "AI Generate": "Générer via IA",
      "Search projects...": "Rechercher des projets...",
      "Recent Projects": "Projets Récents",
      "No projects yet": "Aucun projet pour le moment",
      "Create Project": "Créer un Projet",
      "My Projects": "Mes Projets",
      "Settings": "Paramètres",
      "Dashboard": "Tableau de Bord"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    }
  });

export default i18n;
