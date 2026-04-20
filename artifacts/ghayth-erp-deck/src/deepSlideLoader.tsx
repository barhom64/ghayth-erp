import type { ComponentType } from "react";

import DeepDiveSlide from "@/components/DeepDiveSlide";
import DeepCover from "@/pages/deep/DeepCover";
import DeepThanks from "@/pages/deep/DeepThanks";
import { deepModuleEntries } from "@/data/deep-slides-data";

export interface DeepSlide {
  id: string;
  position: number;
  title: string;
  description: string;
  Component: ComponentType;
}

const totalSlides = deepModuleEntries.length + 2;

export const deepSlides: DeepSlide[] = [
  {
    id: "deep-cover",
    position: 1,
    title: "غلاف جلسة التعمّق",
    description: "غلاف النسخة الموسّعة من عرض غيث ERP",
    Component: DeepCover,
  },
  ...deepModuleEntries.map((entry, i) => {
    const position = i + 2;
    const ModuleSlide: ComponentType = () => (
      <DeepDiveSlide
        entry={entry}
        index={i + 1}
        total={deepModuleEntries.length}
        position={position}
        totalSlides={totalSlides}
      />
    );
    ModuleSlide.displayName = `DeepDive_${entry.key}`;
    return {
      id: `deep-${entry.key}`,
      position,
      title: `${entry.title} — تعمّق`,
      description: entry.intro,
      Component: ModuleSlide,
    };
  }),
  {
    id: "deep-thanks",
    position: totalSlides,
    title: "ختام جلسة التعمّق",
    description: "ختام النسخة الموسّعة من عرض غيث ERP",
    Component: DeepThanks,
  },
];
