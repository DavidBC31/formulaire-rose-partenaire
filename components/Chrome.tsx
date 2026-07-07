const BANDEAU =
  "Espace prestataires ★ Collecte des pièces ★ Plan de prévention ★ Rose Festival 2026 ★ 27 · 28 · 29 août ★ Toulouse MEETT ★ ";

export function Header() {
  return (
    <header>
      <div className="flex items-stretch border-b-2 border-black">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border-2 border-black bg-black text-2xl text-rose">
            ★
          </div>
          <div className="display text-xl leading-[0.95] sm:text-2xl">
            Rose
            <br />
            Festival <span className="text-rose-vif">2026</span>
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center border-x-2 border-black px-4 text-center font-bold uppercase tracking-wider sm:flex">
          27 · 28 · 29 août — Toulouse MEETT
        </div>
        <div className="hidden items-center px-6 md:flex">
          <span className="display rounded-full border-2 border-black bg-black px-5 py-2 text-rose">
            Espace prestataires
          </span>
        </div>
      </div>
      <div className="marquee py-1.5">
        <div className="marquee-inner display text-sm">
          <span className="whitespace-pre">{BANDEAU + BANDEAU}</span>
          <span className="whitespace-pre">{BANDEAU + BANDEAU}</span>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t-2 border-black bg-black py-6 text-center text-rose">
      <div className="display text-lg">★ Rose Festival ★</div>
      <div className="mt-1 text-sm">
        Espace prestataires —{" "}
        <a className="underline" href="mailto:administration@rosefestival.fr">
          administration@rosefestival.fr
        </a>
      </div>
    </footer>
  );
}
