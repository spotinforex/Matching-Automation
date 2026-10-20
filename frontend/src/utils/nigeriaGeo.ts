/**
 * Nigeria Geographic data and helper functions for geocoding state & city scoping.
 * Aligns with FastAPI backend /match/run?STATE=...&CITY=... parameters.
 */

export interface NigerianStateOption {
  value: string;
  label: string;
  capital?: string;
  suggestedCities: string[];
}

export const NIGERIAN_STATES: NigerianStateOption[] = [
  { value: 'Abia', label: 'Abia', capital: 'Umuahia', suggestedCities: ['Aba', 'Umuahia', 'Ohafia'] },
  { value: 'Adamawa', label: 'Adamawa', capital: 'Yola', suggestedCities: ['Yola', 'Mubi', 'Jimeta'] },
  { value: 'Akwa Ibom', label: 'Akwa Ibom', capital: 'Uyo', suggestedCities: ['Uyo', 'Eket', 'Ikot Ekpene'] },
  { value: 'Anambra', label: 'Anambra', capital: 'Awka', suggestedCities: ['Awka', 'Onitsha', 'Nnewi'] },
  { value: 'Bauchi', label: 'Bauchi', capital: 'Bauchi', suggestedCities: ['Bauchi', 'Azare'] },
  { value: 'Bayelsa', label: 'Bayelsa', capital: 'Yenagoa', suggestedCities: ['Yenagoa', 'Brass'] },
  { value: 'Benue', label: 'Benue', capital: 'Makurdi', suggestedCities: ['Makurdi', 'Gboko', 'Otukpo'] },
  { value: 'Borno', label: 'Borno', capital: 'Maiduguri', suggestedCities: ['Maiduguri', 'Biu'] },
  { value: 'Cross River', label: 'Cross River', capital: 'Calabar', suggestedCities: ['Calabar', 'Ikom', 'Ogoja'] },
  { value: 'Delta', label: 'Delta', capital: 'Asaba', suggestedCities: ['Asaba', 'Warri', 'Sapele', 'Ughelli'] },
  { value: 'Ebonyi', label: 'Ebonyi', capital: 'Abakaliki', suggestedCities: ['Abakaliki', 'Afikpo'] },
  { value: 'Edo', label: 'Edo', capital: 'Benin City', suggestedCities: ['Benin City', 'Auchi', 'Ekpoma'] },
  { value: 'Ekiti', label: 'Ekiti', capital: 'Ado Ekiti', suggestedCities: ['Ado Ekiti', 'Ikere'] },
  { value: 'Enugu', label: 'Enugu', capital: 'Enugu', suggestedCities: ['Enugu', 'Nsukka'] },
  { value: 'FCT', label: 'FCT (Federal Capital Territory / Abuja)', capital: 'Abuja', suggestedCities: ['Abuja', 'Garki', 'Wuse', 'Maitama', 'Kubwa'] },
  { value: 'Gombe', label: 'Gombe', capital: 'Gombe', suggestedCities: ['Gombe', 'Kaltungo'] },
  { value: 'Imo', label: 'Imo', capital: 'Owerri', suggestedCities: ['Owerri', 'Orlu', 'Okigwe'] },
  { value: 'Jigawa', label: 'Jigawa', capital: 'Dutse', suggestedCities: ['Dutse', 'Hadejia'] },
  { value: 'Kaduna', label: 'Kaduna', capital: 'Kaduna', suggestedCities: ['Kaduna', 'Zaria', 'Kafanchan'] },
  { value: 'Kano', label: 'Kano', capital: 'Kano', suggestedCities: ['Kano', 'Wudil'] },
  { value: 'Katsina', label: 'Katsina', capital: 'Katsina', suggestedCities: ['Katsina', 'Daura'] },
  { value: 'Kebbi', label: 'Kebbi', capital: 'Birnin Kebbi', suggestedCities: ['Birnin Kebbi', 'Argungu'] },
  { value: 'Kogi', label: 'Kogi', capital: 'Lokoja', suggestedCities: ['Lokoja', 'Okene', 'Kabba'] },
  { value: 'Kwara', label: 'Kwara', capital: 'Ilorin', suggestedCities: ['Ilorin', 'Offa'] },
  { value: 'Lagos', label: 'Lagos', capital: 'Ikeja', suggestedCities: ['Ikeja', 'Lagos', 'Lekki', 'Victoria Island', 'Yaba', 'Surulere'] },
  { value: 'Nasarawa', label: 'Nasarawa', capital: 'Lafia', suggestedCities: ['Lafia', 'Keffi', 'Karu'] },
  { value: 'Niger', label: 'Niger', capital: 'Minna', suggestedCities: ['Minna', 'Suleja', 'Bida'] },
  { value: 'Ogun', label: 'Ogun', capital: 'Abeokuta', suggestedCities: ['Abeokuta', 'Ijebu Ode', 'Sagamu', 'Ota'] },
  { value: 'Ondo', label: 'Ondo', capital: 'Akure', suggestedCities: ['Akure', 'Ondo', 'Owo'] },
  { value: 'Osun', label: 'Osun', capital: 'Osogbo', suggestedCities: ['Osogbo', 'Ile-Ife', 'Ilesa'] },
  { value: 'Oyo', label: 'Oyo', capital: 'Ibadan', suggestedCities: ['Ibadan', 'Ogbomosho', 'Oyo'] },
  { value: 'Plateau', label: 'Plateau', capital: 'Jos', suggestedCities: ['Jos', 'Bukuru'] },
  { value: 'Rivers', label: 'Rivers', capital: 'Port Harcourt', suggestedCities: ['Port Harcourt', 'Obio-Akpor', 'Bonny'] },
  { value: 'Sokoto', label: 'Sokoto', capital: 'Sokoto', suggestedCities: ['Sokoto', 'Tambuwal'] },
  { value: 'Taraba', label: 'Taraba', capital: 'Jalingo', suggestedCities: ['Jalingo', 'Wukari'] },
  { value: 'Yobe', label: 'Yobe', capital: 'Damaturu', suggestedCities: ['Damaturu', 'Potiskum', 'Gashua'] },
  { value: 'Zamfara', label: 'Zamfara', capital: 'Gusau', suggestedCities: ['Gusau', 'Kaura Namoda'] },
];

export function getGeocodingScopeDescription(stateValue: string, cityHint?: string): {
  scopeTitle: string;
  googleFilter: string;
  addressHint: string;
  isCustom: boolean;
} {
  const trimmedState = stateValue?.trim() || '';
  const trimmedCity = cityHint?.trim() || '';
  const lower = trimmedState.toLowerCase();

  if (!trimmedState) {
    return {
      scopeTitle: 'Server Default (Abia State)',
      googleFilter: 'administrative_area:Abia State|country:NG',
      addressHint: `${trimmedCity || 'Aba'}, Abia State, Nigeria`,
      isCustom: false,
    };
  }

  if (['any', 'none', 'open', 'all'].includes(lower)) {
    return {
      scopeTitle: 'Open / Nationwide (All Nigeria)',
      googleFilter: 'country:NG',
      addressHint: trimmedCity ? `${trimmedCity}, Nigeria` : 'Nigeria',
      isCustom: false,
    };
  }

  const normalizedDisplay = trimmedState.endsWith(' State') ? trimmedState : `${trimmedState} State`;

  return {
    scopeTitle: `${trimmedState} (${normalizedDisplay})`,
    googleFilter: `administrative_area:${normalizedDisplay}|country:NG`,
    addressHint: trimmedCity ? `${trimmedCity}, ${normalizedDisplay}, Nigeria` : `${normalizedDisplay}, Nigeria`,
    isCustom: !NIGERIAN_STATES.some(s => s.value.toLowerCase() === lower),
  };
}
