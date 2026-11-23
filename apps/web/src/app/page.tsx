import { redirect } from 'next/navigation';

/** A tela inicial do Régua é o chat. O Radar fica em /radar. */
export default function Inicio() {
  redirect('/chat');
}
