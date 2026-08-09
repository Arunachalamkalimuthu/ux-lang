import { Nav, Footer } from '../../components/Chrome';
import { fragment } from '../../lib/fragment';

export const metadata = {
  title: 'Use cases',
  description:
    'Where a .ux file earns its keep: regenerating an app without losing a step, reviewing flows before code exists, and guarding navigation in CI.',
};

export default async function UseCases() {
  const body = await fragment('use-cases.html');
  return (
    <>
      <Nav current="/use-cases" />
      <main className="wrap" id="top" dangerouslySetInnerHTML={{ __html: body }} />
      <Footer />
    </>
  );
}
