import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import labCatalog from './labCatalog.json';
import type { LabChallenge } from './labCriteriaEvaluator';

const difficultyClass: Record<LabChallenge['difficulty'], string> = {
  Advanced: 'is-advanced',
  Beginner: 'is-beginner',
  Intermediate: 'is-intermediate',
};

export function LabExplorerPage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const challenges = labCatalog as unknown as LabChallenge[];
  const categories = ['ALL', ...Array.from(new Set(challenges.map((challenge) => challenge.category)))];

  const filteredChallenges = challenges.filter(
    (challenge) => selectedCategory === 'ALL' || challenge.category === selectedCategory
  );

  return (
    <div className="vf-labs-page">
      <header className="vf-labs-hero">
        <span className="vf-badge vf-badge--info">
          <Sparkles size={13} />
          Interactive Circuit Labs
        </span>
        <div>
          <h1>Circuit Engineering Challenges</h1>
          <p>
            Practice electronics fundamentals with focused lab tasks, live validation, and progressive hints.
          </p>
        </div>
      </header>

      <div className="vf-labs-filter" aria-label="Lab categories">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`vf-labs-filter__item ${selectedCategory === category ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category === 'ALL' ? 'All Categories' : category}
          </button>
        ))}
      </div>

      <section className="vf-labs-grid">
        {filteredChallenges.map((lab) => (
          <article key={lab.id} className="vf-lab-card">
            <div>
              <div className="vf-lab-card__meta">
                <span className={`vf-lab-card__difficulty ${difficultyClass[lab.difficulty]}`}>
                  {lab.difficulty}
                </span>
                <span className="vf-lab-card__time">
                  <Clock size={12} />
                  {lab.estimatedMinutes} mins
                </span>
              </div>

              <h2>{lab.title}</h2>
              <p>{lab.description}</p>

              <div className="vf-lab-card__objectives">
                <div className="vf-lab-card__objectives-title">
                  Objectives ({lab.objectives.length})
                </div>
                {lab.objectives.map((objective) => (
                  <div key={objective.id} className="vf-lab-card__objective">
                    <span />
                    <p>{objective.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="vf-button vf-button--md vf-button--primary vf-lab-card__start"
              onClick={() => navigate(`/labs/${lab.id}`)}
            >
              <span>Start Lab</span>
              <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
