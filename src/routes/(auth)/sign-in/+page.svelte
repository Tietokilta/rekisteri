<script lang="ts">
	import { enhance } from "$app/forms";
	import type { ActionData } from "./$types";

	let { form }: { form: ActionData } = $props();
</script>

<h1>Sign-in</h1>
<form method="post" use:enhance>
	<label>
		Email
		<input name="email" type="email" required />
	</label>
	<button>Sign-in</button>
</form>
<p style="color: red">{form?.message ?? ""}</p>
