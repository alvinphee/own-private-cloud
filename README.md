# Personal Infrastructure As A Service

✅ See [this blogpost](https://www.foobarflies.io/your-own-public-cloud-why-not/) for a complete (and technical) explanation.

Services :

  - Standard notes — A free, open-source, and completely encrypted notes app
  - Cozy Cloud (_Drive and settings only_) — A smart personal cloud to gather all your data
  - Passbolt — A free, open-source, extensible, OpenPGP-based password manager
  - X-browser Sync — A free and open-source browser syncing tool
  - Davis — A MIT Cal and CardDAV server, based on sabre/dav
  - Wekan — A MIT Kanban board manager, comparable to Trello
  - Syncthing — A continuous file synchronization program under the Mozilla Public License 2.0 license
  - kvtiles — An open-source map tiles server in Go, Apache 2.0 License
  - Cryptpad — An AGPLv3 encrypted collaboration suite
  - OpenSMTPd — an ISC implementation of the SMTP protocol
  - Dovecot — a LGPLv2.1 / MIT robust IMAP server

> All services are served through the Træfik reverse-proxy, certificates are provided by Let's Encrypt, and renewed automatically via Træfik.

# Installation

## Source the env vars needed for OpenStack

    source openrc.sh

## Create the machine

    docker-machine create -d openstack \
    --openstack-flavor-name="b2-7" \
    --openstack-region="GRA5" \
    --openstack-image-name="Debian 9" \
    --openstack-net-name="Ext-Net" \
    --openstack-ssh-user="debian" \
    --openstack-keypair-name="MY_KEY_NAME_IN_OPENSTACK" \
    --openstack-private-key-file="/path/to/.ssh/id_rsa" \
    default

## Install necessary packages on the host (for passbolt - to generate entropy)

    docker-machine ssh default 'sudo apt update && sudo apt install -y -f haveged'

## Mount external attached block storage volume

> The volumes must be attached beforehand in the OpenStack console

#### The databases volume :

    docker-machine ssh default 'sudo fdisk /dev/sdb # n, p, w'
    docker-machine ssh default 'sudo mkfs.ext4 /dev/sdb1'
    docker-machine ssh default 'sudo mkdir /mnt/databases && sudo mount /dev/sdb1 /mnt/databases'
    docker-machine ssh default 'sudo mkdir /mnt/databases/mysql /mnt/databases/couch /mnt/databases/mongo /mnt/databases/postgres'

#### The files volume :

    docker-machine ssh default 'sudo fdisk /dev/sdc # n, p, w'
    docker-machine ssh default 'sudo mkfs.ext4 /dev/sdc1'
    docker-machine ssh default 'sudo mkdir /mnt/files && sudo mount /dev/sdc1 /mnt/files'
    docker-machine ssh default 'sudo mkdir /mnt/files/cozy /mnt/files/sync /mnt/files/cryptpad /mnt/files/mails /mnt/files/tasks'

##### For mails, ensure that the permissions are correct

    docker-machine ssh default 'sudo chown :$MAIL_VOLUME_GROUP /mnt/files/mails'
    docker-machine ssh default 'sudo chmod 775 /mnt/files/mails' # Full access to members of the group
    docker-machine ssh default 'sudo chmod g+s /mnt/files/mails' # Ensure all future content in the folder will inherit group ownership

## Get environment variables to target the remote docker instance

    eval $(docker-machine env default)

### Alternatively, you can create a context :

First, get the host from your `docker-machine env`:

    docker-machine env | grep HOST

Which will return something like:

`export DOCKER_HOST="tcp://xx.yy.zz.aa:2376"`

Use this remote host to create a new context (you can name it how you like, I used `cloud` here):

    docker context create cloud --docker "host=tcp://xx.yy.zz.aa:2376,cert=~/.docker/machine/certs/cert.pem,key=~/.docker/machine/certs/key.pem,ca=~/.docker/machine/certs/ca.pem"

Then, you just have to `docker context use cloud` before being able to run commands as usual.

> You will find all your contexts with `docker context ls` :
>
>     $ docker context ls
>     NAME                DESCRIPTION                               DOCKER ENDPOINT               KUBERNETES ENDPOINT   ORCHESTRATOR
>     cloud *                                                       tcp://xx.yy.zz.aa:2376
>     default             Current DOCKER_HOST based configuration   unix:///var/run/docker.sock                         swarm

> Pay attention! `docker-compose` does not know of contexts ...

## Init all submodules to retrieve up to date code

    git submodule update --init

> When rebuilding, don't forget to update submodules with `git submodule update --recursive --remote`

## Build all custom images

Build configuration files first (_so that environment variables are replaced correctly_):

    ./scripts/build-configuration-files.sh

And then build the images :

    docker-compose build

> If you want to extend the Docker Compose services definitions, you can create an addendum `docker-compose.supplementary.yaml` file for instance, and run `docker-compose` using both files to merge the configurations:
> 
>     docker-compose -f docker-compose.yaml -f docker-compose.supplementary.yml ps
>
> You can check that your configuration is merged correctly with:
> 
>     docker-compose -f docker-compose.yaml -f docker-compose.supplementary.yml config
>   
> See [this Medium post](https://pscheit.medium.com/docker-compose-advanced-configuration-541356d121de) for more details

## Set the Cozy instance

    ./scripts/cozy/init-cozycloud.sh

## Provision the whole thing in daemon mode

    docker-compose up -d

🎉

## Create the Passbolt admin user

    ./scripts/passbolt/init-admin-user.sh

## Init the davis instance if needed (_if the tables do not already exist_)

    ./scripts/davis/init-mysql-tables.sh

## And finally, create a rule so that all the traffic of mail containers (SMTPD mainly) goes out by the `MAIL_HOST_IP` defined in your `.env` file

    ./scripts/mail/create-iptables-rule.sh

# Updating

Update Dockerfiles or the `docker-compose.yml` file, then rebuild the images with `docker-compose build`. You can then recreate each container with the newly built images with `docker-compose up -d {container}`.

For some containers using a shared volume such as Davis (`/var/www/davis`), you need to scrap the underlying volume before updating so that the code is really updated.

For instance:

    docker rm -f davis davis-proxy && docker volume rm davis_www
    docker container prune && docker image prune
    docker-compose up -d --force-recreate --build davis-proxy davis

# SSL

The given Traefik V2.0 configuration (_SSL params, etc_), along with a proper DNS configuration (including a correct CAA entry — see [here](https://blog.qualys.com/ssllabs/2017/03/13/caa-mandated-by-cabrowser-forum)), will result in a **A+** rating in [SSLLabs](https://www.ssllabs.com) :

![A+ Rating page](https://raw.githubusercontent.com/tchapi/own-private-cloud/master/_screenshots/ssl_rating.png)

# DNS entries for mail

You have to add some DNS entries to make your setup work. Run the following scripts to have them listed according to your environment values:

    ./scripts/mail/show-dns-entries.sh

## Test your email server

Test that your SMTP endpoint works as expected:

    openssl s_client -starttls smtp -connect mail.mydomain.com:587

and:

    openssl s_client -connect mail.mydomain.com:465

Both should yield a prompt, and say that the certificate is ok (`Verify return code: 0 (ok)`)

Test your IMAP endpoint (Dovecot) with:

    openssl s_client -connect mail.mydomain.com:993

You can try to login with `A LOGIN {user} {password}` by replacing `{user}` and `{password}` with the real strings, which should yield something along those lines:

    A OK [CAPABILITY IMAP4rev1 SASL-IR LOGIN-REFERRALS ID ENABLE IDLE SORT SORT=DISPLAY THREAD=REFERENCES THREAD=REFS THREAD=ORDEREDSUBJECT MULTIAPPEND URL-PARTIAL CATENATE UNSELECT CHILDREN NAMESPACE UIDPLUS LIST-EXTENDED I18NLEVEL=1 CONDSTORE QRESYNC ESEARCH ESORT SEARCHRES WITHIN CONTEXT=SEARCH LIST-STATUS BINARY MOVE SNIPPET=FUZZY PREVIEW=FUZZY STATUS=SIZE LITERAL+ NOTIFY] Logged in

# Run & Maintenance

To prevent user registration in the notes container :

    docker exec -it notes sed -i 's/\(post "auth" =>\)/# \1/' /data/src/config/routes.rb
    docker-compose restart standardnotes

To prevent user registration in wekan, just go in the settings page (https://{my_subdomain_for_wekan.mydomain.com}/setting) and deactivate it.

To see the disk usage :

    docker-machine ssh default "df -h | grep '^/dev'"

When making a block storage bigger :

  1. First **stop** the container using it (cozy + syncthing for instance, or many more if it's the databases)
  2. Unmount the `/dev/sd*1` volume
  3. Change the size in the Public Cloud interface
  4. WARNING The volume name will likely change
  4. Delete (`d`,`w`) / recreate the partition (`n`,`p`,`w`) / `sudo e2fsck -f /dev/sd*1` / `sudo resize2fs /dev/sd*1`
  5. Remount it
  6. Restart the container
  7. :tada:

See https://www.cloudberrylab.com/resources/blog/linux-resize-partition/ for more info

# Tips

> If you change databases.sh, you need to clear the content of `/mnt/databases/mysql` (`mongo`, or `couch` too if needed) on the host for the entrypoint script to be replayed entirely

### Add a failover IP on Debian 9

Supposing an alias of `1`, and an interface of `ens3` :

Disable auto configuration on boot by adding :

    network: {config: disabled}

in `/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg`

Edit `/etc/network/interfaces.d/50-cloud-init.cfg` and add :

    auto ens3:1
    iface ens3:1 inet static
    address YOUR.FAILOVER.IP
    netmask 255.255.255.255

### The map tiles server

You can change the region, just grab a tag at https://hub.docker.com/r/akhenakh/kvtiles/tags, such as `france-13-latest` for instance.

The tiles server is available directly at https://{MAPS_DOMAIN}/. You can see a handy map at https://{MAPS_DOMAIN}/static/?key={MAPS_API_KEY}.

### How-to rename a docker volume

    echo "Creating destination volume ..."
    docker volume create --name new_volume_name
    echo "Copying data from source volume to destination volume ..."
    docker run --rm \
               -i \
               -t \
               -v old_volume_name:/from \
               -v new_volume_name:/to \
               alpine ash -c "cd /from ; cp -av . /to"

# Literature

  - Docker best practices : https://blog.docker.com/2019/07/intro-guide-to-dockerfile-best-practices/
  - Nginx Reverse proxy : https://www.thepolyglotdeveloper.com/2017/03/nginx-reverse-proxy-containerized-docker-applications/
  - nginx TLS / SSL configuration options : https://gist.github.com/konklone/6532544
  - Lets Encrypt with Docker : https://devsidestory.com/lets-encrypt-with-docker/
  - Lets Encrypt with Docker (alt) : https://medium.com/@pentacent/nginx-and-lets-encrypt-with-docker-in-less-than-5-minutes-b4b8a60d3a71
  - Create and configure a block volume in OVH Public Cloud : https://docs.ovh.com/fr/public-cloud/creer-et-configurer-un-disque-supplementaire-sur-une-instance/
  - Shell command  / Entrypoint in Docker : https://stackoverflow.com/questions/41512237/how-to-execute-a-shell-command-before-the-entrypoint-via-the-dockerfile
  - Ignore files for Cozy drive : https://github.com/cozy-labs/cozy-desktop/blob/master/doc/usage/ignore_files.md
  - Deploy your own SAAS : https://github.com/Atarity/deploy-your-own-saas/blob/master/README.md
  - A set of Ansible playbooks to build and maintain your own private cloud : https://github.com/sovereign/sovereign/blob/master/README.md

## Mails

  - How to run your own mail server : https://www.c0ffee.net/blog/mail-server-guide/
  - Mail servers are not hard : https://poolp.org/posts/2019-08-30/you-should-not-run-your-mail-server-because-mail-is-hard/
  - NSA-proof your e-mail in 2 hours : https://sealedabstract.com/code/nsa-proof-your-e-mail-in-2-hours/
  - Mail-in-a-Box : https://mailinabox.email/
  - Setting up a mailserver with OpenSMTPD and Dovecot : https://poolp.org/posts/2019-09-14/setting-up-a-mail-server-with-opensmtpd-dovecot-and-rspamd/
  - OpenSMTPD: Setting up a mailserver : http://z5t1.com:8080/cucumber_releases/cucumber-1.1/source/net-extra/opensmtpd/doc/example1.html
  - Test a SMTP server : https://www.stevenrombauts.be/2018/12/test-smtp-with-telnet-or-openssl/
  - A simple mailserver with Docker : https://tvi.al/simple-mail-server-with-docker/
  - A set of Ansible playbooks to build and maintain your own private cloud : https://github.com/sovereign/sovereign/blob/master/README.md
  - Setting up an email server in 2020 with OpenSMTPD and Dovecot https://prefetch.eu/blog/2020/email-server/
  - How to self-host your email server : https://www.garron.blog/posts/host-your-email-server.html
  - About changing the outgoing address for a network of containers : https://medium.com/@havloujian.joachim/advanced-docker-networking-outgoing-ip-921fc3090b09
  - An OpenBSD E-Mail Server Using OpenSMTPD, Dovecot, Rspamd, and RainLoop https://www.vultr.com/docs/an-openbsd-e-mail-server-using-opensmtpd-dovecot-rspamd-and-rainloop

## Dockerfiles :

  - Cozy : https://github.com/cozy/cozy-stack/blob/master/docs/INSTALL.md
  - Passbolt : https://hub.docker.com/r/passbolt/passbolt/
  - Standard Notes : https://github.com/arugifa/standardnotes-server-docker/blob/master/Dockerfile
  - MariaDB : https://github.com/docker-library/mariadb/blob/master/10.4/docker-entrypoint.sh
  - x-browser-sync : https://github.com/xbrowsersync/api-docker
  - syncthing : https://github.com/syncthing/syncthing/blob/master/Dockerfile

## Other alternatives

See https://github.com/Kickball/awesome-selfhosted for more awesome self-hosted alternatives.

### Other CalDav / CardDav projects worth noting

  - SoGo : https://sogo.nu/support/faq/how-to-install-sogo-on-debian.html
  - Radicale : https://radicale.org/
  - Calendar Server:  https://www.calendarserver.org/ (Apple)
  - An android client app for CalDav / CardDav : https://gitlab.com/bitfireAT/davx5-ose - https://f-droid.org/packages/at.bitfire.davdroid/

### About the tiles server

  - The blog post : https://blog.nobugware.com/post/2020/free-maps-for-all/
  - The repository : https://github.com/akhenakh/kvtiles
