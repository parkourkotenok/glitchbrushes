import styles from './LandingScreen.module.css';

export interface LandingScreenProps {
  onEnter: () => void;
}

export function LandingScreen({ onEnter }: LandingScreenProps) {
  return (
    <main className={styles.screen}>
      <header className={styles.brand}>PARKOUR KOTENOK</header>
      <button type="button" className={styles.enter} onClick={onEnter}>
        GLITCH BRUSHES
      </button>
    </main>
  );
}
