<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import { router } from '$lib/router.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Toasts from './components/Toasts.svelte';
  import Logo from './components/Logo.svelte';
  import Welcome from './pages/Welcome.svelte';
  import Offers from './pages/Offers.svelte';
  import OfferDetail from './pages/OfferDetail.svelte';
  import ApplyCv from './pages/ApplyCv.svelte';
  import ApplyLetter from './pages/ApplyLetter.svelte';
  import ApplySend from './pages/ApplySend.svelte';
  import Tracking from './pages/Tracking.svelte';
  import Documents from './pages/Documents.svelte';
  import Settings from './pages/Settings.svelte';

  let failed = $state('');

  onMount(async () => {
    try {
      await store.init();
    } catch (e) {
      failed = store.errorText(e);
    }
  });

  // Premier lancement : tant que la configuration n'est pas finie, on reste sur l'accueil.
  $effect(() => {
    if (!store.ready) return;
    const name = router.route.name;
    if (!store.settings.onboarded && name !== 'bienvenue') router.go('/bienvenue', true);
    else if (store.settings.onboarded && (name === 'home' || name === 'bienvenue')) router.go('/offres', true);
  });
</script>

{#if failed}
  <div class="center"><div class="card stack"><h1>Boing n'a pas pu démarrer</h1><p>{failed}</p></div></div>
{:else if !store.ready}
  <div class="center" aria-busy="true"><Logo size={44} /></div>
{:else if router.route.name === 'bienvenue'}
  <Welcome />
{:else}
  <div class="shell">
    <Sidebar />
    <main>
      {#key router.route.path}
        {#if router.route.name === 'offres'}<Offers />
        {:else if router.route.name === 'offre'}<OfferDetail id={router.route.params.id} />
        {:else if router.route.name === 'cv'}<ApplyCv id={router.route.params.id} />
        {:else if router.route.name === 'lettre'}<ApplyLetter id={router.route.params.id} />
        {:else if router.route.name === 'envoi'}<ApplySend id={router.route.params.id} />
        {:else if router.route.name === 'suivi'}<Tracking />
        {:else if router.route.name === 'documents'}<Documents />
        {:else if router.route.name === 'parametres'}<Settings />
        {/if}
      {/key}
    </main>
  </div>
{/if}
<Toasts />

<style>
  .shell { display: flex; min-height: 100vh; }
  main { flex: 1; min-width: 0; height: 100vh; overflow-y: auto; }
  .center { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
</style>
