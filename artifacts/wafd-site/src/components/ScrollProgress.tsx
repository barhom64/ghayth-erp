import { useEffect } from "react";

export default function ScrollProgress() {
  useEffect(() => {
    const bar = document.createElement("div");
    bar.id = "scroll-progress";
    document.body.prepend(bar);

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = `${progress}%`;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      bar.remove();
    };
  }, []);

  return null;
}
