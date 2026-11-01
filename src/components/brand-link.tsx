import type { MouseEventHandler, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export default function BrandLink({
  children,
  className,
  copyClassName,
  onClick,
}: {
  children: ReactNode;
  className: string;
  copyClassName?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link href="/" className={className} onClick={onClick} aria-label="TalantaLink home">
      <Image className="brand-logo" src="/talantalink-logo.jpg" alt="" width={40} height={40} />
      <span className={copyClassName ? `brand-copy ${copyClassName}` : "brand-copy"}>{children}</span>
    </Link>
  );
}
