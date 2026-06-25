import "react-phone-number-input/style.css";

import PhoneInputBase from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type PhoneInputProps = {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Champ téléphone : sélecteur de pays (drapeaux) + numéro formaté, valeur en E.164.
 * Pays par défaut BE, accepte l'international. Réutilise l'Input shadcn pour le style ;
 * la mise en forme du « trigger » pays vit dans `.inigo-phone` (global.css).
 */
export function PhoneInput({ className, value, onChange, ...props }: PhoneInputProps) {
  return (
    <PhoneInputBase
      international
      defaultCountry="BE"
      countryCallingCodeEditable={false}
      flags={flags}
      inputComponent={Input}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      className={cn("inigo-phone", className)}
      {...props}
    />
  );
}
