#!/bin/bash

# Post-installation du paquet .deb (référencé par electron-builder.yml → deb.afterInstall).
# Reprend le script par défaut d'electron-builder
# (app-builder-lib/templates/linux/after-install.tpl) avec UNE différence :
# chrome-sandbox est installé SUID root dans tous les cas.
#
# Pourquoi : le script d'origine ne pose le bit SUID que si les user namespaces
# non privilégiés paraissent indisponibles — or il teste cela en root, pour qui
# ils le sont toujours. Sur Ubuntu 24.04 et Linux Mint 22, le noyau réserve ces
# namespaces aux processus privilégiés
# (kernel.apparmor_restrict_unprivileged_userns=1) : l'utilisateur normal se
# retrouve alors sans namespace ET sans helper SUID, et Chromium refuse de
# démarrer (« The SUID sandbox helper binary was found, but is not configured
# correctly »). Poser 4755 systématiquement est ce que fait le .deb de Google
# Chrome ; le sandbox reste opérationnel sur toutes les distributions.
#
# Les macros ${...} sont substituées par electron-builder à la construction du
# paquet ; n'utiliser QUE $VAR sans accolades pour les variables shell.

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

chown root:root '/opt/${sanitizedProductName}/chrome-sandbox' || true
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
