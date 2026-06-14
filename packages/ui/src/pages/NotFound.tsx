import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="text-center">
        <div className="font-serif text-[80px] leading-none tracking-[-0.04em] text-ink">404</div>
        <p className="mt-4 max-w-sm text-[14px] italic text-ink-muted">
          {t("notFound.message")}
        </p>
        <Link to="/dashboard" className="mt-6 inline-block">
          <Button>{t("notFound.cta")}</Button>
        </Link>
      </div>
    </div>
  );
}
